import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { validateSession } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  // Only admins can fetch the pending review queue
  const authResult = await validateSession('admin');
  if (!authResult.authorized) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);

    // Pagination params with defaults and limits
    const page  = Math.max(parseInt(searchParams.get('page')  || '1'),  1);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);

    // Filtering params with basic validation and sanitization
    const status = searchParams.get('status') || 'pending';   
    const assetId = (searchParams.get('asset_id') || '').slice(0, 50);
    const location = (searchParams.get('location') || '').slice(0, 100);
    const condition = (searchParams.get('condition')|| '');

    // Generic search/searchField — this is what dynamicPage.tsx's search
    // box actually sends (?search=X&searchField=asset_id or location_id).
    // Without this, typing into the Maintenance Review search box did
    // nothing, since only the specific 'asset_id'/'location' params above
    // were ever being read (and 'location' didn't even match the
    // 'location_id' key the search box actually sends) (WC)
    const search = (searchParams.get('search') || '').slice(0, 100);
    const allowedSearchFields: Record<string, string> = {
      asset_id: 'asset_id',
      location_id: 'location_id',
    };
    const searchFieldParam = searchParams.get('searchField') || '';
    const searchColumn = allowedSearchFields[searchFieldParam] ?? null;

    // Whitelist allowed status values, default to 'pending' if invalid
    const allowedStatuses = ['pending', 'approved', 'rejected'];
    const safeStatus = allowedStatuses.includes(status) ? status : 'pending';

    // Whitelist allowed condition values, null if invalid (no filter applied)
    const allowedConditions = ['In-use', 'In-store', 'Spoiled'];
    const safeCondition = allowedConditions.includes(condition) ? (condition as 'In-use' | 'In-store' | 'Spoiled') : null;

    // Build the base query for a given status with optional filters
    const buildBase = (forStatus: 'pending' | 'approved' | 'rejected') => {
      let q = supabaseAdmin
        .from('Maintenance')
        .select('*', { count: 'exact' })
        .eq('maintenance_needed', true)
        .eq('approval_status', forStatus);

      // Apply optional filters if provided
      if (assetId) q = q.ilike('asset_id', `%${assetId}%`);
      if (location) q = q.ilike('location_id', `%${location}%`);
      if (safeCondition) q = q.eq('condition_status', safeCondition);

      // Apply the generic search box, same pattern as assets/route.ts
      // and auditLog/route.ts (WC)
      if (search && searchColumn) {
        q = q.ilike(searchColumn, `%${search}%`);
      }

      return q;
    };

    // All done in parallel for efficiency
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch the paginated results for the requested status, and counts for all tabs in parallel
    const [pageResult, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      buildBase(safeStatus as 'pending' | 'approved' | 'rejected').order('assessed_dt', { ascending: false }).range(from, to),
      
      // Counts for all tabs, ignoring pagination, but applying the same filters for consistency
      supabaseAdmin
        .from('Maintenance')
        .select('*', { count: 'exact', head: true })
        .eq('maintenance_needed', true)
        .eq('approval_status', 'pending'),

      supabaseAdmin
        .from('Maintenance')
        .select('*', { count: 'exact', head: true })
        .eq('maintenance_needed', true)
        .eq('approval_status', 'approved'),

      supabaseAdmin
        .from('Maintenance')
        .select('*', { count: 'exact', head: true })
        .eq('maintenance_needed', true)
        .eq('approval_status', 'rejected'),
    ]);

    // Handle errors and prepare the response
    if (pageResult.error) throw pageResult.error;
    
    const totalItems = pageResult.count ?? 0;
    const totalPages = Math.ceil(totalItems / limit);

    return NextResponse.json({
      success: true,
      assessments: pageResult.data ?? [],
      totalItems,
      totalPages,
      tabCounts: {
        pending:  pendingCount.count  ?? 0,
        approved: approvedCount.count ?? 0,
        rejected: rejectedCount.count ?? 0,
      },
    });

  } catch (error: any) {
    console.error('Pending assessments fetch error:', { message: error?.message });
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}