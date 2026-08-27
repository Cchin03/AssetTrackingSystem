// app/api/saveMaintenance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // This route handles saving maintenance assessments (WC)
  try {
    const body = await req.json();
    const {
      asset_id,
      location_id,
      condition_status,
      department_id,
      maintenance_needed,
      priority,
      feedback,
      ai_response,
      image_base64,   
      image_mime,     
      assessed_by,
    } = body;

    // Validate the existing location_id (WC)
    const { data: locationExists, error: locationError } = await supabaseAdmin
      .from('Location')
      .select('location_id')
      .eq('location_id', location_id)
      .single();

    if (locationError || !locationExists) {
      return NextResponse.json({
        success: false,
        error: `Invalid location_id: ${location_id} does not exist`,
      });
    }

    //  Insert DB record without image (WC)
    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('Maintenance')
      .insert({
        asset_id,
        location_id,
        department_id,
        condition_status,
        maintenance_needed,
        priority,
        feedback: feedback ?? null,
        ai_response: ai_response ?? null,
        assessed_by: assessed_by ?? null,
        image_url: null,
        approval_status: 'pending',
      })
      .select()
      .single();

    if (assessmentError) {
      console.error('DB insert error:', assessmentError.message);
      return NextResponse.json({
        success: false,
        error: `Failed to save assessment: ${assessmentError.message}`,
      });
    }

    console.log('Assessment saved:', assessment.id);

    // Upload image AFTER DB insert succeeds (WC)
    let imageUrl: string | null = null;

    if (maintenance_needed && image_base64) {
      try {
        console.log('Uploading image (maintenance needed)...');
        const buffer = Buffer.from(image_base64, 'base64');
        const ext = image_mime === 'image/png' ? 'png' : image_mime === 'image/webp' ? 'webp' : 'jpg';
        const fileName = `${asset_id}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabaseAdmin
          .storage
          .from('AssetImage')
          .upload(fileName, buffer, {
            contentType: image_mime ?? 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Image upload error:', uploadError);
        } else {
          const { data: urlData } = supabaseAdmin
            .storage
            .from('AssetImage')
            .getPublicUrl(fileName);

          imageUrl = urlData.publicUrl;
          console.log('Image uploaded:', imageUrl);

          //Update the record with the image URL (WC)
          await supabaseAdmin
            .from('Maintenance')
            .update({ image_url: imageUrl })
            .eq('id', assessment.id);
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        // DB record is safe, image upload failure is non-critical, 
        // so we just log the error and continue without the image URL (WC)
      }
    }

    // Fetch the asset's current state BEFORE updating it, so we can record
    // old vs. new values in the audit log (WC)
    const { data: assetBefore } = await supabaseAdmin
      .from('Asset')
      .select('condition, location_id, department_id')
      .eq('asset_id', asset_id)
      .single();

    // Update asset condition (WC)
    const { error: updateError } = await supabaseAdmin
      .from('Asset')
      .update({
        condition: condition_status,
        location_id: location_id   ?? null,
        department_id: department_id ?? null,
        updated_dt: new Date().toISOString(),
      })
      .eq('asset_id', asset_id);

    if (updateError) {
      console.error('Error updating asset condition:', updateError.message);
    } else {
      // Write an AuditLog entry now that the asset update has succeeded.
      // This is best-effort — a failure here should NOT fail the whole
      // request, since the maintenance assessment itself already saved
      // successfully (WC)
      try {
        const { error: auditError } = await supabaseAdmin.from('AuditLog').insert({
          table_name: 'Asset',
          record_id: asset_id,
          action: 'UPDATE',
          old_values: assetBefore ?? null,
          new_values: {
            condition: condition_status,
            location_id: location_id ?? null,
            department_id: department_id ?? null,
          },
          reason: feedback ?? ai_response ?? null,
          user_id: assessed_by ?? null,
        });

        if (auditError) {
          console.error('Failed to write audit log:', auditError.message);
        }
      } catch (auditErr) {
        console.error('Unexpected error writing audit log:', auditErr);
      }
    }
    // Even if asset update fails, we still return success for the assessment save, since the main purpose of this route is to save the maintenance assessment.
    //  The asset update is a secondary action that we attempt but don't want to cause the whole operation to fail if it doesn't work (WC)
    return NextResponse.json({
      success: true,
      assessment: {
        id: assessment.id,
        asset_id: assessment.asset_id,
        location_id: assessment.location_id,
        condition_status: assessment.condition_status,
        department_id: assessment.department_id,
        maintenance_needed: assessment.maintenance_needed,
        priority: assessment.priority,
        feedback: assessment.feedback,
        ai_response: assessment.ai_response,
        image_url: imageUrl,
        approval_status: assessment.approval_status,
        assessed_dt: assessment.assessed_dt,
        assessed_by: assessment.assessed_by,
        created_dt: assessment.created_dt,
        updated_dt: assessment.updated_dt,
      },
    });

  } catch (err: any) {
    console.error('saveMaintenance error:', err);
    return NextResponse.json({ success: false, error: err.message });
  }
}