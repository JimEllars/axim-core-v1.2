import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { ethers } from "https://esm.sh/ethers@6.11.1";
import SafeApiKit from "https://esm.sh/@safe-global/api-kit@2.4.3";
import Safe from "https://esm.sh/@safe-global/protocol-kit@3.0.1";
import { MetaTransactionData, OperationType } from "https://esm.sh/@safe-global/safe-core-sdk-types@5.0.1";

console.log("Smart Contract Dispatcher Service function loaded");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing Supabase configuration");
    }

    const { lead_id, partner_id, amount, wallet_address } = await req.json();

    if (!partner_id || !amount || !wallet_address) {
       throw new Error("Missing required payload parameters: partner_id, amount, wallet_address");
    }

    console.log(`Executing smart contract payout on Arbitrum for partner ${partner_id}`);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Secure the environment signer properties using database service-role keys
    const { data: connection, error: connError } = await supabase
      .from('ecosystem_connections')
      .select('api_key, webhook_url')
      .eq('service_name', 'arbitrum_wallet')
      .eq('status', 'active')
      .single();

    if (connError || !connection) {
       throw new Error("Blockchain wallet connection configuration not found or inactive.");
    }

    // The API key field holds the private key, webhook_url holds the RPC URL
    const privateKey = connection.api_key;
    const rpcUrl = connection.webhook_url || "https://arb1.arbitrum.io/rpc";

    // Validate the target wallet address
    if (!ethers.isAddress(wallet_address)) {
        throw new Error("Invalid destination wallet address.");
    }

    // Set up the Arbitrum provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl, 42161);
    const wallet = new ethers.Wallet(privateKey, provider);

    const safeAddress = Deno.env.get("GNOSIS_SAFE_ADDRESS");
    if (!safeAddress) {
        throw new Error("Missing Gnosis Safe Address configuration");
    }

    // Using USDC contract on Arbitrum One
    const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

    // Minimal ABI for ERC-20 transfer
    const abi = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function decimals() view returns (uint8)"
    ];

    const usdcInterface = new ethers.Interface(abi);

    // Format amount (USDC has 6 decimals)
    const decimals = 6;
    const amountToTransfer = ethers.parseUnits(amount.toString(), decimals);

    const safeTransactionData: MetaTransactionData = {
      to: USDC_ADDRESS,
      data: usdcInterface.encodeFunctionData("transfer", [wallet_address, amountToTransfer]),
      value: "0",
      operation: OperationType.Call,
    };

    console.log(`Initializing Gnosis Safe Protocol Kit...`);
    const protocolKit = await Safe.default.init({
      provider: rpcUrl,
      signer: privateKey,
      safeAddress
    });

    console.log(`Creating Safe transaction...`);
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [safeTransactionData]
    });

    console.log(`Broadcasting Safe transaction to Arbitrum network via Relayer. Amount: ${amount} USDC`);

    let txHash;
    try {
        const txResponse = await protocolKit.executeTransaction(safeTransaction);
        console.log(`Transaction sent. Hash: ${txResponse.hash}`);

        // Wait for 1 confirmation
        const receipt = await provider.waitForTransaction(txResponse.hash, 1);
        if (receipt && receipt.status !== 1) {
            throw new Error("Transaction execution reverted on-chain.");
        }
        txHash = txResponse.hash;
        console.log(`Transaction confirmed in block ${receipt?.blockNumber}`);
    } catch (txError: any) {
        console.error("On-chain transaction failed:", txError);
        throw new Error(`Engine Fault: Transaction failed during gas estimation or execution: ${txError.message || 'Unknown error'}`);
    }

    // Remove local fallback, explicitly use the provided partner_id
    const { data: record, error: dbError } = await supabase
        .from("blockchain_transactions")
        .insert({
            partner_id: partner_id,
            wallet_address: wallet_address,
            amount: amount,
            currency: "USDC",
            status: "minted",
            transaction_hash: txHash,
            smart_contract_address: USDC_ADDRESS
        })
        .select()
        .single();

    if (dbError) {
        console.error("Failed to log transaction to database", dbError);
        // Throw an explicit error if we fail to write the hash back to the database
        throw new Error(`Engine Fault: Transaction succeeded on-chain (${txHash}), but failed to persist to database: ${dbError.message}`);
    }

    return new Response(JSON.stringify({ success: true, transaction: record }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error in smart-contract-dispatcher:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
