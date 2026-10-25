import { supabaseDataProvider } from "ra-supabase-core";
import {
  withLifecycleCallbacks,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type ResourceCallbacks,
} from "ra-core";
import type {
  ContactNote,
  Deal,
  DealNote,
  RAFile,
  Sale,
  SalesFormData,
  SearchResourceName,
  SearchResult,
  SignUpData,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { ATTACHMENTS_BUCKET } from "../commons/attachments";
import { getIsInitialized } from "./authProvider";
import { getSupabaseClient, supabasePublishableKey } from "./supabase";

const getBaseDataProvider = () =>
  supabaseDataProvider({
    instanceUrl: import.meta.env.VITE_SUPABASE_URL,
    apiKey: supabasePublishableKey as string,
    supabaseClient: getSupabaseClient(),
    sortOrder: "asc,desc.nullslast" as any,
  });

// Tofu: Tofu deploys no Supabase Edge Function, so the user and merge methods below call the database functions
// of supabase/migrations/20261025210000_tofu_without_edge_functions.sql instead. Their errors carry the code the
// pages know (email_taken, ...) as the hint, and the address as the detail.
const salesError = (error: any, fallbackMessage: string) =>
  Object.assign(new Error(error?.message || fallbackMessage), {
    code: error?.hint || undefined,
    email: error?.details || undefined,
  });

// Tofu: upstream removed a note's files from storage in its `delete_note_attachments` Edge Function, called by
// database triggers; here the page removes them once the note is deleted or saved without them.
const NOTE_RESOURCES = ["contact_notes", "deal_notes"];
const attachmentPaths = (attachments: unknown): string[] =>
  Array.isArray(attachments)
    ? [
        ...new Set(
          attachments
            .map((attachment) => (attachment as RAFile | null)?.path)
            .filter((path): path is string => typeof path === "string" && path.trim() !== ""),
        ),
      ]
    : [];
const removeNoteFiles = async (paths: string[]) => {
  if (paths.length === 0) return;
  const { error } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .remove(paths);
  if (error) {
    console.error("delete_note_attachments.error", error);
  }
};

const processCompanyLogo = async (params: any) => {
  const logo = params.data.logo;

  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

const getDataProviderWithCustomMethods = () => {
  const baseDataProvider = getBaseDataProvider();

  return {
    ...baseDataProvider,
    async getList(resource: string, params: GetListParams) {
      if (resource === "companies") {
        return baseDataProvider.getList("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getList("contacts_summary", params);
      }
      if (resource === "activity_log") {
        const { data, total } = await baseDataProvider.getList(
          "activity_log",
          params,
        );
        // Rename snake_case view columns to camelCase to match Activity type
        return {
          data: data.map((row: any) => ({
            ...row,
            contactNote: row.contact_note ?? undefined,
            dealNote: row.deal_note ?? undefined,
            contact_note: undefined,
            deal_note: undefined,
          })),
          total,
        };
      }

      return baseDataProvider.getList(resource, params);
    },
    async getOne(resource: string, params: any) {
      if (resource === "companies") {
        return baseDataProvider.getOne("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getOne("contacts_summary", params);
      }

      return baseDataProvider.getOne(resource, params);
    },
    async update(resource: string, params: any) {
      const result = await baseDataProvider.update(resource, params);
      if (NOTE_RESOURCES.includes(resource)) {
        const kept = new Set(attachmentPaths(result.data?.attachments));
        await removeNoteFiles(
          attachmentPaths(params.previousData?.attachments).filter(
            (path) => !kept.has(path),
          ),
        );
      }
      return result;
    },
    async delete(resource: string, params: any) {
      const result = await baseDataProvider.delete(resource, params);
      if (NOTE_RESOURCES.includes(resource)) {
        await removeNoteFiles(
          attachmentPaths((result.data ?? params.previousData)?.attachments),
        );
      }
      return result;
    },

    async signUp({ email, password, first_name, last_name }: SignUpData) {
      const response = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name,
            last_name,
          },
        },
      });

      if (!response.data?.user || response.error) {
        console.error("signUp.error", response.error);
        // Tofu: the auth service's error code and status go with the message, so the sign-up page can tell a copy
        // that sends no email yet (TOFU.md, Accounts and sign-up) from any other refusal.
        throw Object.assign(
          new Error(response?.error?.message || "Failed to create account"),
          {
            code: response?.error?.code,
            status: response?.error?.status,
          },
        );
      }

      // Update the is initialized cache
      (getIsInitialized as any)._is_initialized_cache = true;

      return {
        id: response.data.user.id,
        email,
        password,
      };
    },
    async salesCreate(body: SalesFormData) {
      const { data, error } = await getSupabaseClient().rpc("tofu_add_sale", {
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        administrator: body.administrator ?? false,
        disabled: body.disabled ?? false,
        password: body.password || null,
      });

      if (!data || error) {
        console.error("salesCreate.error", error);
        throw salesError(error, "Failed to create the user");
      }

      if (!body.password) {
        // Upstream's function emailed an invitation; here the auth service sends its password email, as
        // "Forgot password?" does. Mail needs the app's sign-in set up (TOFU.md), so a refusal is not an error.
        await getSupabaseClient()
          .auth.resetPasswordForEmail(body.email.trim().toLowerCase())
          .catch(() => undefined);
      }

      return data as Sale;
    },
    async salesUpdate(
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ) {
      const {
        email,
        secondary_emails,
        first_name,
        last_name,
        administrator,
        avatar,
        disabled,
      } = data;

      const { data: updatedData, error } = await getSupabaseClient().rpc(
        "tofu_update_sale",
        {
          sales_id: id,
          email: email ?? null,
          secondary_emails: secondary_emails ?? null,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          avatar: avatar ?? null,
          administrator: administrator ?? null,
          disabled: disabled ?? null,
        },
      );

      if (!updatedData || error) {
        console.error("salesUpdate.error", error);
        throw salesError(error, "Failed to update account manager");
      }

      return updatedData as Sale;
    },
    async updatePassword(_id: Identifier) {
      // Upstream's `update_password` function asked the auth service for a password email for the signed-in user.
      const { data: dataSession } = await getSupabaseClient().auth.getSession();
      const email = dataSession?.session?.user?.email;
      const { error } = email
        ? await getSupabaseClient().auth.resetPasswordForEmail(email)
        : { error: new Error("Not signed in") };

      if (error) {
        console.error("update_password.error", error);
        throw new Error("Failed to update password");
      }

      return true;
    },
    async unarchiveDeal(deal: Deal) {
      // get all deals where stage is the same as the deal to unarchive
      const { data: deals } = await baseDataProvider.getList<Deal>("deals", {
        filter: { stage: deal.stage },
        pagination: { page: 1, perPage: 1000 },
        sort: { field: "index", order: "ASC" },
      });

      // set index for each deal starting from 1, if the deal to unarchive is found, set its index to the last one
      const updatedDeals = deals.map((d, index) => ({
        ...d,
        index: d.id === deal.id ? 0 : index + 1,
        archived_at: d.id === deal.id ? null : d.archived_at,
      }));

      return await Promise.all(
        updatedDeals.map((updatedDeal) =>
          baseDataProvider.update("deals", {
            id: updatedDeal.id,
            data: updatedDeal,
            previousData: deals.find((d) => d.id === updatedDeal.id),
          }),
        ),
      );
    },
    async isInitialized() {
      return getIsInitialized();
    },
    async globalSearch(
      query: string,
      resources: readonly SearchResourceName[],
      maxResults: number,
    ): Promise<SearchResult[]> {
      const { data, error } = await getSupabaseClient().rpc("global_search", {
        query,
        resources,
        max_results: maxResults,
      });
      if (error) {
        console.error("global_search.error", error);
        throw new Error("Failed to search");
      }
      return data ?? [];
    },
    async mergeContacts(sourceId: Identifier, targetId: Identifier) {
      const { data, error } = await getSupabaseClient().rpc("merge_contacts", {
        loser_id: sourceId,
        winner_id: targetId,
      });

      if (error) {
        console.error("merge_contacts.error", error);
        throw new Error("Failed to merge contacts");
      }

      return { success: true, winnerId: data ?? targetId };
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    async updateConfiguration(
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: { id: 1 },
      });
      return data.config as ConfigurationContextValue;
    },
  } satisfies DataProvider;
};

export type CrmDataProvider = ReturnType<
  typeof getDataProviderWithCustomMethods
>;

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
    return logo.src;
  }
  return logo?.src ?? "";
};

const lifeCycleCallbacks: ResourceCallbacks[] = [
  {
    resource: "configuration",
    beforeUpdate: async (params) => {
      const config = params.data.config;
      if (config) {
        config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
        config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
      }
      return params;
    },
  },
  {
    resource: "contact_notes",
    beforeSave: async (data: ContactNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "deal_notes",
    beforeSave: async (data: DealNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "sales",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
    beforeSave: async (data: Sale, _, __) => {
      if (data.avatar) {
        await uploadToBucket(data.avatar);
      }
      return data;
    },
  },
  {
    resource: "contacts",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "first_name",
        "last_name",
        "company_name",
        "title",
        "email",
        "phone",
        "background",
      ])(params);
    },
  },
  {
    resource: "companies",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "name",
        "phone_number",
        "website",
        "zipcode",
        "city",
        "state_abbr",
      ])(params);
    },
    beforeCreate: async (params) => {
      const createParams = await processCompanyLogo(params);

      return {
        ...createParams,
        data: {
          created_at: new Date().toISOString(),
          ...createParams.data,
        },
      };
    },
    beforeUpdate: async (params) => {
      return await processCompanyLogo(params);
    },
  },
  {
    resource: "contacts_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
  },
  {
    resource: "deals",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["name", "category", "description"])(params);
    },
  },
];

export const getDataProvider = () => {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    throw new Error("Please set the VITE_SUPABASE_URL environment variable");
  }
  if (supabasePublishableKey === undefined) {
    throw new Error(
      "Please set the VITE_SB_PUBLISHABLE_KEY environment variable",
    );
  }
  return withLifecycleCallbacks(
    getDataProviderWithCustomMethods(),
    lifeCycleCallbacks,
  ) as CrmDataProvider;
};

const applyFullTextSearch = (columns: string[]) => (params: GetListParams) => {
  if (!params.filter?.q) {
    return params;
  }
  const { q, ...filter } = params.filter;
  return {
    ...params,
    filter: {
      ...filter,
      "@or": columns.reduce((acc, column) => {
        if (column === "email")
          return {
            ...acc,
            [`email_fts@ilike`]: q,
          };
        if (column === "phone")
          return {
            ...acc,
            [`phone_fts@ilike`]: q,
          };
        else
          return {
            ...acc,
            [`${column}@ilike`]: q,
          };
      }, {}),
    },
  };
};

const uploadToBucket = async (fi: RAFile) => {
  if (!fi.src.startsWith("blob:") && !fi.src.startsWith("data:")) {
    // Sign URL check if path exists in the bucket
    if (fi.path) {
      const { error } = await getSupabaseClient()
        .storage.from(ATTACHMENTS_BUCKET)
        .createSignedUrl(fi.path, 60);

      if (!error) {
        return fi;
      }
    }
  }

  const dataContent = fi.src
    ? await fetch(fi.src)
        .then((res) => {
          if (res.status !== 200) {
            return null;
          }
          return res.blob();
        })
        .catch(() => null)
    : fi.rawFile;

  if (dataContent == null) {
    // We weren't able to download the file from its src (e.g. user must be signed in on another website to access it)
    // or the file has no content (not probable)
    // In that case, just return it as is: when trying to download it, users should be redirected to the other website
    // and see they need to be signed in. It will then be their responsibility to upload the file back to the note.
    return fi;
  }

  const file = fi.rawFile;
  const fileParts = file.name.split(".");
  const fileExt = fileParts.length > 1 ? `.${file.name.split(".").pop()}` : "";
  const fileName = `${Math.random()}${fileExt}`;
  const filePath = `${fileName}`;
  const { error: uploadError } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(filePath, dataContent);

  if (uploadError) {
    console.error("uploadError", uploadError);
    throw new Error("Failed to upload attachment");
  }

  const { data } = getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .getPublicUrl(filePath);

  fi.path = filePath;
  fi.src = data.publicUrl;

  // save MIME type
  const mimeType = file.type;
  fi.type = mimeType;

  return fi;
};
