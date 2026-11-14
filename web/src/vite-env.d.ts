/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_GAME_CONTRACT?: string;
  readonly VITE_NEAR_RPC?: string;
  readonly VITE_USE_MOCK?: string;
  readonly VITE_FUND_URL?: string;
  readonly VITE_PRIVY_APP_ID?: string;
}
