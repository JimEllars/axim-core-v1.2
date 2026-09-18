import React from "react";
import { ThirdwebProvider, ConnectButton } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { useAuth } from "../../contexts/AuthContext";

// Network Target Parameters forced by AXiM Infrastructure Strategy
const ARBITRUM_CHAIN_ID = 42161;
const AXIM_CORE_TELEMETRY_URL = "https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/satellite-telemetry";

export default function Web3ConnectButton({ microAppName = "AXiM-Micro-App-Spoke" }) {
  const { user, isAuthenticated } = useAuth();
  const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;
  const client = clientId ? createThirdwebClient({ clientId }) : null;

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

  let buttonText = "Login";
  if (isAuthenticated && user) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name;
    const email = user.email;
    const wallet = user.user_metadata?.wallet_address;

    const displayIdentifier = name || (email ? email.split('@')[0] : null) || (wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : 'User');
    buttonText = `Hi ${displayIdentifier}`;
  }

  if (!client) {
    return <button className="axim-core-btn text-sm font-mono tracking-wider transition-all duration-200 uppercase px-4 py-2">{buttonText}</button>;
  }

  return (
    <ThirdwebProvider>
      <div className="axim-web3-button-wrapper">
        <ConnectButton
          client={client}
          wallets={[
            // Web2 to Web3 Bridge: Embedded social logins
            inAppWallet({
              auth: {
                options: ["google", "apple", "email"],
              },
            }),
            // Traditional Web3 Extension Support
            createWallet("io.metamask"),
            // Multisig Vault Handshaking (APF safe contracts pattern)
            createWallet("safe"),
          ]}
          theme="dark"
          connectButton={{
            label: buttonText,
            className: "axim-core-btn text-sm font-mono tracking-wider transition-all duration-200 uppercase",
          }}
          connectModal={{
            size: "compact",
            title: "Select AXiM Access Method",
            welcomeScreen: {
              title: "AXiM Core Link",
              subtitle: "Accessing decentralized network utility infrastructure.",
            }
          }}
          onConnect={async (wallet) => {
            const address = wallet.getAccount()?.address;
            const walletId = wallet.id;
            if (address) {
                await handleWalletConnectionTelemetry(address, walletId);
            }
          }}
        />
      </div>
    </ThirdwebProvider>
  );
}
