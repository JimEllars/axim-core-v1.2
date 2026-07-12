import React from "react";
import {
  ThirdwebProvider,
  ConnectWallet,
  embeddedWallet,
  metamaskWallet,
  safeWallet
} from "@thirdweb-dev/react"; // or equivalent Thirdweb Client SDK version

// Network Target Parameters forced by AXiM Infrastructure Strategy
const ARBITRUM_CHAIN_ID = 42161;
const AXIM_CORE_TELEMETRY_URL = "https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/satellite-telemetry";

export default function Web3ConnectButton({ microAppName = "AXiM-Micro-App-Spoke" }) {

  // Captures and pipes client state transitions back to the Core Spine passively
  const handleWalletConnectionTelemetry = async (walletAddress, walletType) => {
    try {
      const telemetryPayload = {
        meta: {
          source: microAppName,
          event_type: "wallet.connected",
          timestamp: new Date().toISOString()
        },
        telemetry: {
          wallet_address: walletAddress,
          connection_type: walletType,
          chain_id: ARBITRUM_CHAIN_ID,
          session_status: "active"
        }
      };

      // Passive fire-and-forget bridge to the primary API gateway
      await fetch(AXIM_CORE_TELEMETRY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telemetryPayload)
      });
    } catch (error) {
      // Graceful fallback to prevent frontend crashes due to telemetry failures
      console.warn("[Web3Connect] Telemetry sync skipped safely:", error.message);
    }
  };

  return (
    <ThirdwebProvider
      activeChain="arbitrum" // Strictly locks transaction context to Arbitrum One
      clientId={import.meta.env.VITE_THIRDWEB_CLIENT_ID} // Employs public client key only
      supportedWallets={[
        // Web2 to Web3 Bridge: Embedded social logins
        embeddedWallet({
          auth: {
            options: ["google", "apple", "email"],
          },
        }),
        // Traditional Web3 Extension Support
        metamaskWallet(),
        // Multisig Vault Handshaking (APF safe contracts pattern)
        safeWallet(),
      ]}
    >
      <div className="axim-web3-button-wrapper">
        <ConnectWallet
          theme="dark"
          btnTitle="Connect Ecosystem Wallet"
          className="axim-core-btn text-sm font-mono tracking-wider transition-all duration-200 uppercase"
          modalTitle="Select AXiM Access Method"
          modalSize="compact"
          welcomeScreen={{
            title: "AXiM Core Link",
            subtitle: "Accessing decentralized network utility infrastructure.",
          }}
          onConnect={async (wallet) => {
            const address = await wallet.getAddress();
            const walletId = wallet.getWalletId();
            await handleWalletConnectionTelemetry(address, walletId);
          }}
        />
      </div>
    </ThirdwebProvider>
  );
}
