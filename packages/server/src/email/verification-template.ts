interface VerificationTemplateProps {
  verificationLink: string;
}

export const renderVerificationTemplate = ({
  verificationLink,
}: VerificationTemplateProps): string => {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Verify Your Email - ClassPrints</title>
      <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f9fafb; }
        a { color: #38bdf8; text-decoration: none; }
        a:hover { color: #0ea5e9; }
      </style>
    </head>
    <body>
      <h1>Verify Your Email</h1>
      <p>Thank you for signing up for ClassPrints! To complete your registration, please verify your email address by clicking the link below.</p>
      <p><a href="${verificationLink}">Verify Email Address</a></p>
      <p style="color: #d1d5db; font-size: 14px;">If you didn't create this account, you can safely ignore this email.</p>
    </body>
  </html>`;
};
