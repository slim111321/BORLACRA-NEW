import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "samsa_whatsapp_secure_token";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // 2. Message Payload Handler (POST)
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Check if it's a valid WhatsApp message
      if (body.object === "whatsapp_business_account") {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            const value = change.value;
            
            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const phone = message.from;

              // If user sent text
              if (message.type === "text") {
                const text = message.text.body;
                console.log(`Received text from ${phone}: ${text}`);
                
                // Real-world: We would call WhatsApp Send API here
                // return "Please select the Paperclip (📎) icon and send your 'Location' to book a pickup."
              }

              // If user sent location (The Magic Action)
              if (message.type === "location") {
                const lat = message.location.latitude;
                const lng = message.location.longitude;
                console.log(`Received location from ${phone}: ${lat}, ${lng}`);

                // Try to find if user exists, otherwise fallback/dummy
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('id')
                  .eq('phone', phone)
                  .single();

                // Insert into pickups table
                const { error } = await supabase.from('pickups').insert([{
                  user_id: profile?.id ?? null, // Can be null if anonymous booking allows it
                  status: 'pending',
                  address: `WhatsApp Pin (${lat}, ${lng})`,
                  latitude: lat,
                  longitude: lng,
                  phone_number: phone, 
                  trash_type: 'Mixed Waste',
                  payment_status: 'pending'
                }]);

                if (error) {
                  console.error("Failed to insert pickup:", error);
                } else {
                  console.log("WhatsApp pickup successfully created!");
                  // Real-world: We would call WhatsApp API to send confirmation message
                  // "Your SamSa pickup is confirmed! Translating pin to our collectors..."
                }
              }
            }
          }
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      } else {
        return new Response("Not a valid WhatsApp event", { status: 404 });
      }
    } catch (err) {
      console.error(err);
      return new Response("Error processing request", { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
