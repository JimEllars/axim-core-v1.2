import { ethers } from 'ethers';

// 1. Construct a clean cryptographic SIWE handshake within our gateway layers.
export const generateSIWEMessage = (domain, address, statement, uri, version, chainId, nonce, issuedAt) => {
  return `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
};

// Transmit the verified cryptographic signature packet to the serverless edge database to securely exchange it for a valid Supabase JWT session token.
export const verifySIWESignatureAndGetJWT = async (message, signature, address) => {
  try {
    const verifiedAddress = ethers.utils.verifyMessage(message, signature);
    if (verifiedAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Signature verification failed.");
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-siwe-exchange`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ message, signature, address })
    });

    if (!response.ok) {
        throw new Error("Failed to exchange SIWE signature for JWT.");
    }

    const data = await response.json();
    return data;

  } catch (err) {
      console.error("[SIWE Verification] Error:", err);
      throw err;
  }
};


// Refactor auth-handoff.js to pass unified JWT tokens between axim.us.com and satellite games
export const generateCrossDomainHandoffUrl = (targetDomain, aximSessionToken) => {
  if (!aximSessionToken) return targetDomain;
  const url = new URL(targetDomain);
  url.searchParams.set('handoff_token', aximSessionToken);
  return url.toString();
};
