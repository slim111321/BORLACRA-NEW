import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Standardised USSD Gateway Interface
interface UssdRequest {
  sessionId: string;
  phoneNumber: string;
  text: string;     // The input the user just typed
  type: string;     // "Initiation" or "Response"
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body: UssdRequest = await req.json();
    const { sessionId, phoneNumber, text, type } = body;
    let responseText = "";
    let isTerminating = false;

    // 1. Get or Create Session
    let { data: session } = await supabase
      .from('ussd_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!session || type === "Initiation") {
      // New Session
      session = {
        session_id: sessionId,
        phone_number: phoneNumber,
        current_step: 0,
      };
      await supabase.from('ussd_sessions').upsert(session);
      
      responseText = "Welcome to SamSa Waste.\n1. Request Pickup\n0. Exit";
      return new Response(JSON.stringify({ Message: responseText, Type: "Response" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Handle State Machine based on current_step
    const input = text.trim();

    if (input === '0') {
      responseText = "Thank you for using SamSa. Goodbye!";
      isTerminating = true;
    } 
    else if (session.current_step === 0 && input === '1') {
      // User chose Request Pickup
      await supabase.from('ussd_sessions').update({ current_step: 1 }).eq('session_id', sessionId);
      responseText = "Enter your Landmark or Area (e.g., Kasoa New Market):";
    }
    else if (session.current_step === 1) {
      // User entered location
      await supabase.from('ussd_sessions').update({ 
        current_step: 2,
        saved_location: input 
      }).eq('session_id', sessionId);
      
      responseText = `Location saved: ${input}\nSelect Trash Type:\n1. Plastics (+Points)\n2. General Waste`;
    }
    else if (session.current_step === 2) {
      // User entered Trash Type, finalize booking
      const trashType = input === '1' ? 'Plastics' : 'General Waste';
      const address = session.saved_location;

      // The Magic Action: Insert booking to the actual database!
      const { error } = await supabase.from('pickups').insert([{
        status: 'pending',
        address: `USSD Request: ${address}`,
        phone_number: phoneNumber,
        trash_type: trashType,
        payment_status: 'pending'
      }]);

      if (error) {
        console.error("USSD Booking error:", error);
        responseText = "Sorry, an error occurred while booking. Please try again later.";
      } else {
        responseText = `Booking Confirmed for ${address}! A collector is heading your way. They will call ${phoneNumber} shortly.`;
      }
      
      isTerminating = true;
    }
    else {
      responseText = "Invalid input. Please try again.";
    }

    // 3. Clean up if terminating
    if (isTerminating) {
      await supabase.from('ussd_sessions').delete().eq('session_id', sessionId);
    }

    // Return the required gateway format
    return new Response(JSON.stringify({ 
      Message: responseText, 
      Type: isTerminating ? "Release" : "Response" 
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ Message: "System Error. Please try again later.", Type: "Release" }), {
      status: 200, // Always return 200 to gateways, just Release session
      headers: { "Content-Type": "application/json" },
    });
  }
});
