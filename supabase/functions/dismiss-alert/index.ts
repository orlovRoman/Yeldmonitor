import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Parse request body
    const { alertId } = await req.json();
    
    if (!alertId || !UUID_REGEX.test(alertId)) {
      return new Response(JSON.stringify({ error: 'Valid alertId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Dismissing alert:', alertId);
    
    // Use service role client for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify alert exists before updating
    const { data: existingAlert, error: fetchError } = await supabase
      .from('pendle_alerts')
      .select('id, status')
      .eq('id', alertId)
      .single();

    if (fetchError || !existingAlert) {
      return new Response(JSON.stringify({ error: 'Alert not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update alert status to dismissed
    const { error: updateError } = await supabase
      .from('pendle_alerts')
      .update({ status: 'dismissed' })
      .eq('id', alertId);

    if (updateError) {
      console.error('Error updating alert:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to dismiss alert' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Alert dismissed:', alertId);

    return new Response(JSON.stringify({
      success: true,
      alertId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in dismiss-alert:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
