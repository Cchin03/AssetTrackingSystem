// lib/supabase/types.ts
/** Commented by Desmond @ 12-Jan-2026
 * Split the supabase.ts file into three separate files: client.ts, server.ts and types.ts
 * This file contains type definitions for the database tables in Supabase
 * Each table has Row, Insert, and Update types to define the shape of data
 * when reading, inserting, or updating records.
 * Updated on 11-Feb-2026 to match the new DB schema including audit and soft deletion. 
*/

// This matches PostgreSQL / JSONB columns
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

/**
 * Commented by Desmond @ 11-Feb-2026
 * Set pre-determined asset condition to prevent incorrect or mismatched 
 * values from being entered into the database records.
 */
export type assetCondition = 'In-use' | 'In-store' | 'Spoiled'

// Database interface: It represents the entire Supabase database schema
// It is expected by "createClient<Database>" in client.ts and server.ts
export interface Database {
    public: {
        Tables: { // Follow the patter of Row, Insert and Update
            Users: { // Table name according to Supabase
                Row: { // Represents what comes out of the database, select()
                    id: string
                    microsoft_user_id: string
                    role: string
                    created_at: string
                    last_login: string | null
                }
                Insert: { // What you are allowed to PUT in, used by .insert()
                    id?: string
                    microsoft_user_id: string
                    role?: string
                    created_at?: string
                    last_login?: string | null
                }
                Update: { // What you can change, used by .update()
                    id?: string
                    microsoft_user_id?: string
                    role?: string
                    created_at?: string
                    last_login?: string | null
                }
                // Placeholder for foregin key metadata
                Relationships: []
            }

            Location: {
                Row: {
                    location_id: string
                    // Commented by Desmond @ 11-Feb-2026 : Start
                    // Changed so that location name cannot be null
                    name: string
                    description: string | null
                    block: string | null
                    level: number | null
                    tag_path: string | null
                    created_by: string | null
                    created_dt: string
                    updated_dt: string
                    deleted_dt: string | null
                }
                Insert: {
                    location_id: string
                    // Changed so that location name cannot be null
                    name?: string
                    description?: string | null
                    block?: string | null
                    level?: number | null
                    tag_path?: string | null
                    created_by?: string | null
                    created_dt?: string
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Update: {
                    location_id?: string
                    // Changed so that location name cannot be null
                    // Commented by Desmond @ 11-Feb-2026 : End
                    name?: string
                    description?: string | null
                    block?: string | null
                    level?: number | null
                    tag_path?: string | null
                    created_by?: string | null
                    created_dt?: string
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Relationships: []
            }

            Department: {
                Row: {
                    department_id: string
                    // Commented by Desmond @ 11-Feb-2026 : Start
                    // Changed so that department name cannot be null
                    name: string
                    block: string | null
                    level: number | null
                    tag_path: string | null
                    created_by: string | null
                    created_dt: string
                    updated_dt: string
                    deleted_dt: string | null
                }
                Insert: {
                    department_id: string
                    // Changed so that department name cannot be null
                    name?: string
                    block?: string | null
                    level?: number | null
                    tag_path?: string | null
                    created_by?: string | null
                    created_dt?: string
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Update: {
                    department_id?: string
                    // Changed so that department name cannot be null
                    // Commented by Desmond @ 11-Feb-2026 : End
                    name?: string
                    block?: string | null
                    level?: number | null
                    tag_path?: string | null
                    created_by?: string | null
                    created_dt?: string
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Relationships: []
            }

            Asset: {
                Row: {
                    asset_id: string
                    tag_path: string | null
                    // Commented by Desmond @ 11-Feb-2026 : Start
                    // Changed so that asset name, model and category cannot be null
                    name: string
                    model: string
                    description: string | null
                    // Changed it so that the condition will only accept pre-determined
                    // values
                    condition: assetCondition
                    location_id: string | null
                    department_id: string | null
                    category: string
                    // Commented by Desmond @ 26-April-26
                    // last_assessed_dt for maintenance assessment record
                    last_assessed_dt?: string | null
                    created_dt: string
                    // The user who created the record
                    created_by: string | null
                    updated_dt: string
                    // deleted_dt having value means the record is removed
                    deleted_dt: string | null
                }
                Insert: {
                    asset_id: string
                    tag_path?: string | null
                    // Commented by Desmond @ 11-Feb-2026 : Start
                    // Changed so that asset name, model and category cannot be null
                    name?: string
                    model?: string
                    description?: string | null
                    // Changed it so that the condition will only accept pre-determined
                    // values
                    condition?: assetCondition
                    location_id?: string | null
                    department_id?: string | null
                    category?: string
                    // Commented by Desmond @ 26-April-26
                    // last_assessed_dt for maintenance assessment record
                    last_assessed_dt?: string | null
                    created_dt?: string
                    created_by?: string | null
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Update: {
                    asset_id?: string
                    tag_path?: string | null
                    // Commented by Desmond @ 11-Feb-2026 : End
                    // Changed so that asset name, model and category cannot be null
                    name?: string
                    model?: string
                    description?: string | null
                    // Changed it so that the condition will only accept pre-determined
                    // values
                    condition?: assetCondition
                    location_id?: string | null
                    department_id?: string | null
                    category?: string
                    // Commented by Desmond @ 26-April-26
                    // last_assessed_dt for maintenance assessment record
                    last_assessed_dt?: string | null
                    created_dt?: string
                    created_by?: string | null
                    updated_dt?: string
                    deleted_dt?: string | null
                }
                Relationships: []
            }

            Staff: {
                Row: {
                    staff_id: string
                    name: string | null
                    email: string | null
                    mobile_no: string | null
                    department_id: string | null
                    microsoft_user_id: string | null
                    created_dt: string
                    updated_dt: string
                    status: string
                    role: string | null
                }
                Insert: {
                    staff_id: string
                    name?: string | null
                    email?: string | null
                    mobile_no?: string | null
                    department_id?: string | null
                    microsoft_user_id?: string | null
                    created_dt?: string
                    updated_dt?: string
                    status?: string
                    role?: string | null
                }
                Update: {
                    staff_id?: string
                    name?: string | null
                    email?: string | null
                    mobile_no?: string | null
                    department_id?: string | null
                    microsoft_user_id?: string | null
                    created_dt?: string
                    updated_dt?: string
                    status?: string
                    role?: string | null
                }
                Relationships: []
            }

            StaffAsset: {
                Row: {
                    id: string
                    staff_id: string | null
                    asset_id: string | null
                    created_dt: string
                }
                Insert: {
                    id: string
                    staff_id?: string | null
                    asset_id?: string | null
                    created_dt?: string
                }
                Update: {
                    id?: string
                    staff_id?: string | null
                    asset_id?: string | null
                    created_dt?: string
                }
                Relationships: []
            }

            Sessions: {
                Row: {
                    id: string
                    staff_id: string
                    microsoft_id: string | null
                    status: string
                    login_location: string | null
                    created_dt: string
                }
                Insert: {
                    id?: string
                    staff_id: string
                    microsoft_id?: string | null
                    status?: string
                    login_location?: string | null
                    created_dt?: string
                }
                Update: {
                    id?: string
                    staff_id?: string
                    microsoft_id?: string | null
                    status?: string
                    login_location?: string | null
                    created_dt?: string
                }
                Relationships: []
            }

            LocationHistory: {
                Row: {
                    id: string
                    location_id: string | null
                    asset_id: string | null
                    created_dt: string
                }
                Insert: {
                    id: string
                    location_id?: string | null
                    asset_id?: string | null
                    created_dt?: string
                }
                Update: {
                    id?: string
                    location_id?: string | null
                    asset_id?: string | null
                    created_dt?: string
                }
                Relationships: []
            }

            /**
             * Commented by Desmond @ 11-Feb-2026
             * This is a new type for the audit log table in Supabase
             * Currently a PLACEHOLDER
             */
            AuditLog: {
                Row: {
                    audit_id: number
                    table_name: string
                    record_id: string
                    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
                    old_values: Json | null
                    new_values: Json | null
                    user_id: string | null
                    created_dt: string
                    reason?: string | null
                }
                Insert: {
                    audit_id?: number
                    table_name: string
                    record_id: string
                    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
                    old_values?: Json | null
                    new_values?: Json | null
                    user_id?: string | null
                    created_dt?: string
                    reason?: string | null
                }
                Update: {
                    audit_id?: number
                    table_name?: string
                    record_id?: string
                    action?: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
                    old_values?: Json | null
                    new_values?: Json | null
                    user_id?: string | null
                    created_dt?: string
                    reason?: string | null

                }
                Relationships: []
            }

            Maintenance: {
                Row: {
                    id: string;
                    asset_id: string;
                    location_id: string;
                    department_id?: string | null;
                    condition_status: Database['public']['Enums']['condition_status_enum']
                    maintenance_needed: boolean;
                    priority: Database['public']['Enums']['priority_enum'];
                    ai_response: string | null;
                    feedback: string | null; 
                    image_url?: string | null;  
                    actioned_at?: string | null;    
                    approval_status?: Database['public']['Enums']['approval_status_enum'];      
                    assessed_dt: string;
                    assessed_by: string | null;
                    created_dt: string;
                    updated_dt: string;
                };
                Insert: {
                    id?: string;
                    asset_id: string;
                    location_id: string;
                    department_id?: string | null;   
                    condition_status: 'In-use' | 'In-store' | 'Spoiled';
                    maintenance_needed?: boolean;
                    priority?: 'none' | 'low' | 'medium' | 'high';
                    approval_status?: 'pending' | 'approved' | 'rejected'; 
                    ai_response?: string | null;
                    feedback?: string | null;  
                    image_url?: string | null;       
                    actioned_at?: string | null;    
                    assessed_dt?: string;
                    assessed_by?: string | null;
                    created_dt?: string;
                    updated_dt?: string;
                };
                Update: {
                    id?: string;
                    asset_id?: string;
                    location_id?: string;
                    condition_status?: 'In-use' | 'In-store' | 'Spoiled';
                    maintenance_needed?: boolean;
                    priority?: 'none' | 'low' | 'medium' | 'high';
                    approval_status?: 'pending' | 'approved' | 'rejected';
                    image_url?: string | null;       
                    actioned_at?: string | null;    
                    ai_response?: string | null;
                    feedback?: string | null;  
                    assessed_dt?: string;
                    assessed_by?: string | null;
                    created_dt?: string;
                    updated_dt?: string;
                };
                Relationships: [
                    {
                    foreignKeyName: "maintenance_assessments_asset_id_fkey";
                    columns: ["asset_id"];
                    referencedRelation: "Asset";
                    referencedColumns: ["asset_id"];
                    },
                    {
                    foreignKeyName: "maintenance_assessments_location_id_fkey";
                    columns: ["location_id"];
                    referencedRelation: "Location";
                    referencedColumns: ["location_id"];
                    },
                    {
                    foreignKeyName: "maintenance_assessments_department_id_fkey";
                    columns: ["department_id"];
                    referencedRelation: "Department";
                    referencedColumns: ["department_id"];
                    }
                ];
            };
        }
        /* 
            Commented by Desmond @ 21-Jan-2026: Start
            - The following functions were added to resolve an issue in the API routes
            - where Supabase functions returned "never" type
            - Therefore, this is a workaround to fix the issue
        */
        Views: {
            // Meaning empty, and we are not using these features yet
            [_ in never]: never
        }

        Functions: {
            // RPC functions to be used in the application
            get_next_staff_id: {
                Args: Record<string, never> // No arguments
                Returns: string // Returns the next staff ID
            }
        }

        Enums: {
            // Create enum types for condition_status, priority and approval_status to ensure data integrity
            condition_status_enum: 'In-use' | 'In-store' | 'Spoiled'
            priority_enum: 'none' | 'low' | 'medium' | 'high'
            approval_status_enum: 'pending' | 'approved' | 'rejected'
        }

        CompositeTypes: {
            // Meaning empty, and we are not using these features yet
            [_ in never]: never
        }

        // Commented by Desmond @ 21-Jan-2026: End
    }
}

export interface MaintenanceAssessment {
    id: string;
    asset_id: string;          
    location_id: string; 
    department_id?: string | null;      
    condition_status: Database['public']['Enums']['condition_status_enum']
    maintenance_needed: boolean;
    priority: Database['public']['Enums']['priority_enum'];
    ai_response?: string | null;
    feedback?: string | null;  
    image_url?: string | null;           
    approval_status?: Database['public']['Enums']['approval_status_enum'];           
    actioned_at?: string | null;       
    assessed_dt: string;
    assessed_by: string | null;
    created_dt: string;
    updated_dt: string;
    }

export interface AssessmentInput {
  asset_id: string;          
  location_id: string;       
  department_id?: string | null;
  condition_status: Database['public']['Enums']['condition_status_enum'];
  maintenance_needed: boolean;
  priority: Database['public']['Enums']['priority_enum'];
  ai_response: string | null;
  assessed_by: string | null;
}

export interface AiAssessmentResult {
  condition: Database['public']['Enums']['condition_status_enum'];
  maintenanceNeeded: boolean;
  priority: Database['public']['Enums']['priority_enum']
  issues: string[];
  fullResponse: string;
}