/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_GOOGLE_AUTH_ENABLED?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_PRODUCT_SHORT_NAME?: string;
  readonly VITE_PRODUCT_MARK?: string;
  readonly VITE_LEGAL_NAME?: string;
  readonly VITE_LEGAL_EMAIL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_STATUS_URL?: string;
  readonly VITE_TERMS_EFFECTIVE_DATE?: string;
}
