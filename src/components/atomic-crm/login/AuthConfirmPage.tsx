import { useState } from "react";
import { useTranslate } from "ra-core";
import { useLocation, useNavigate } from "react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/supabase/layout";
import { getSupabaseClient } from "../providers/supabase/supabase";

// Tofu: the sign-in emails Tofu writes into the app's auth service link to
// <app>/auth/confirm?token_hash=…&type=… (public/auth/confirm/index.html hands them to this page). Nothing is used
// until the person presses the button, so a mail scanner that opens the link spends nothing. A password email
// leads on to the set-password page; any other confirmation signs the person in.
const TYPES: readonly string[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export const AuthConfirmPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const params = new URLSearchParams(useLocation().search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const valid = !!tokenHash && !!type && TYPES.includes(type);
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  const confirm = async () => {
    if (!tokenHash || !type) return;
    setState("working");
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      setState("failed");
      return;
    }
    if ((type === "recovery" || type === "invite") && data.session) {
      const tokens = new URLSearchParams({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      navigate(`/set-password?${tokens}`);
      return;
    }
    navigate("/");
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {translate("crm.auth.confirm.title", { _: "Confirm it's you" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {!valid
            ? translate("crm.auth.confirm.invalid", {
                _: "This link is incomplete. Open the whole link from the email.",
              })
            : state === "failed"
              ? translate("crm.auth.confirm.failed", {
                  _: "This link has expired or was already used. Ask for a new email.",
                })
              : translate("crm.auth.confirm.description", {
                  _: "Press Continue to finish what the email asked for.",
                })}
        </p>
      </div>
      {valid && state !== "failed" && (
        <Button
          type="button"
          className="w-full"
          disabled={state === "working"}
          onClick={confirm}
        >
          {translate("crm.auth.confirm.button", { _: "Continue" })}
        </Button>
      )}
    </Layout>
  );
};

AuthConfirmPage.path = "/auth-confirm";
