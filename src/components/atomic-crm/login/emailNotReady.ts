// Tofu: a copy's auth service sends email only once its owner turns on sign-in on the app's Sign-in page in Tofu,
// which gives it Tofu's sending address (TOFU.md, Accounts and sign-up). Before that, on a Supabase Cloud database
// the built-in mailer refuses every address outside Supabase's own team (400 `email_address_not_authorized`), and an
// auth service with no working mail answers 500 "Error sending confirmation email" ("recovery" for a password
// email). It sends a sign-up's confirmation inside the sign-up's own transaction, so a refused sign-up leaves no
// account behind. The refusal's own words count too: supabase-js drops the code when the browser may not read the
// answer's API version header.
export const isEmailNotReady = (error: unknown) => {
  const { code, status, message } = (error ?? {}) as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const text = typeof message === "string" ? message : "";
  return (
    code === "email_address_not_authorized" ||
    /^Email address .* cannot be used as it is not authorized$/.test(text) ||
    (status === 500 &&
      /^Error sending (confirmation|recovery) email$/.test(text))
  );
};
