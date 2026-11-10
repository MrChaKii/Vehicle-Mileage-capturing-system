# Backend configuration

## Local environment

Copy `.env.example` to `.env` in this directory and fill in the values for your
machine. `.env` files are ignored by Git; commit only the blank `.env.example`
template. The backend reads `AUTH_TOKEN_SECRET` for signing tokens. Keep all
backend secrets on the server and configure production values using your hosting
provider's environment-variable settings.

## Google Drive meter photos

Meter photos are uploaded to a private Google Drive folder. The database stores
the Drive file ID; image requests are served by the backend only to admin and
superadmin accounts.

1. Enable the Google Drive API in the Google Cloud project associated with the
   existing OAuth client.
2. Obtain a refresh token for the Google account that owns or has edit access
   to the private Drive folder. The OAuth grant must include the
   `https://www.googleapis.com/auth/drive` scope.
3. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REFRESH_TOKEN`, and `DRIVE_FOLDER_ID` in the backend
   environment. See `.env.example`. `GOOGLE_REDIRECT_URI` is optional and is
   only needed if it was part of the OAuth refresh-token flow.

Keep the Drive folder private. The backend returns a clear upload error if the
OAuth credentials are missing or the account cannot access the folder. Keep
OAuth secrets in the backend environment only; do not expose them to the
frontend or commit them to source control.
