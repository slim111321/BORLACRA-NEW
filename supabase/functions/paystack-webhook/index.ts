// Paystack Webhook - Secure Payment Verification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // 1. Verify Paystack Signature
  // Paystack sends a hash of the payload in the header for verification
  const signature = req.headers.get("x-paystack-signature");
  if (!signature) {
    return new Response("No signature found", { status: 400 });
  }

  const rawBody = await req.text();
  
  // Verify HMAC SHA512
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(PAYSTACK_SECRET_KEY);
  const dataBuf = encoder.encode(rawBody);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify", "sign"]
  );

  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const isValid = await crypto.subtle.verify(
    "HMAC",
    hmacKey,
    signatureBytes,
    dataBuf
  );

  if (!isValid) {
    console.error("Invalid Paystack Signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const { event, data } = JSON.parse(rawBody);

  // 2. Handle 'charge.success' event
  if (event === "charge.success") {
    const { amount, reference, customer, metadata } = data;
    const userId = metadata?.userId;
    const paymentType = metadata?.type || 'unknown';
    
    console.log(`Verified payment of ${amount / 100} GHS from ${customer.email} for ${paymentType}`);

    try {
      // a) Log to payment_history
      const { error: logError } = await supabase
        .from('payment_history')
        .insert({
          user_id: userId,
          amount: amount / 100, // Convert from pesewas/kobo
          payment_type: paymentType,
          paystack_ref: reference,
          metadata: metadata
        });

      if (logError) throw logError;

      // b) Handle specific business logic based on payment type
      if (paymentType === 'wallet_topup') {
        // Increment wallet balance
        const { error: walletError } = await supabase.rpc('increment_wallet', { 
          row_id: userId, 
          amount_to_add: amount / 100 
        });
        if (walletError) throw walletError;
      }

      return new Response(JSON.stringify({ status: "success" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });

    } catch (err) {
      console.error("Database Update Error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response("Event not handled", { status: 200 });
});
