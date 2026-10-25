import { useMutation } from "@tanstack/react-query";
import {
  CanAccess,
  minLength,
  Navigate,
  useDataProvider,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { getSalesErrorNotification } from "./salesErrorNotification";
import { SalesInputs } from "./SalesInputs";

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: () => {
      notify("resources.sales.create.success", {
        messageArgs: {
          _: "User created. They sign in with the password you gave them, or set one with “Forgot password?” on the sign-in page.",
        },
      });
      redirect("/sales");
    },
    onError: (error) => {
      const { message, args } = getSalesErrorNotification(
        error,
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
      );
      notify(message, { type: "error", messageArgs: args });
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <CanAccess
      resource="sales"
      action="create"
      accessDenied={<Navigate to="/access-denied" />}
    >
      <div className="max-w-lg w-full mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("resources.sales.create.title", {
                _: "Create a new user",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
              <SalesInputs />
              {/* Tofu: a first password, so a new user can sign in before the app can send email (TOFU.md). */}
              <TextInput
                source="password"
                type="password"
                autoComplete="new-password"
                validate={minLength(6)}
                helperText={translate("resources.sales.create.password_help", {
                  _: "Optional. Give it to them so they can sign in at once, without waiting for an email.",
                })}
              />
            </SimpleForm>
          </CardContent>
        </Card>
      </div>
    </CanAccess>
  );
}
