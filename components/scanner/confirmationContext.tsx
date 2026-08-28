'use client'
import React, { useState, useEffect, useRef } from "react"
import { useSession } from 'next-auth/react'
import type { Database } from '@/lib/supabase/types'
// Removed direct Supabase client import — all database calls now go through API routes
// to prevent table names and queries from leaking in the browser Network tab
import {
  ChevronLeft,
  CheckCircle,
  Edit,
  AlertCircle,
  Save,
  PackagePlus,
  MapPin,
  Building2,
  Upload,
  Sparkles,
  PenLine,
  RefreshCw,
} from "lucide-react"

// Types (WC)
type Asset = {
  asset_id: string; name: string; description: string;
  location_id: string; department_id: string;
  condition: string; category: string; model: string;
}

type Department = Database['public']['Tables']['Department']['Row']
type Location = Database['public']['Tables']['Location']['Row']
type PriorityLevel = 'none' | 'low' | 'medium' | 'high'
type ConditionStatus = 'In-use' | 'In-store' | 'Spoiled'

export type SubmitResult = {
  asset_id: string
  name: string
  category: string
  model: string
  condition: string
  location_id: string | null
  department_id: string | null
  submitType: string
}

// limit the feedback to 50 words, sanitize input to prevent any special characters that could cause issues in the database or display (WC)
const FEEDBACK_MAX_WORDS = 50
function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}
function sanitizeFeedback(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\s.,!?;:()\-'"]/g, '')
}
function truncateToWords(text: string | null | undefined, maxWords: number): string {
  if (!text) {
    return ''
  }

  return text.trim().split(/\s+/).slice(0, maxWords).join(' ')
}

const conditionOptions: ConditionStatus[] = ['In-use', 'In-store', 'Spoiled'];

// Priority level colors (WC)
const priorityColors: Record<PriorityLevel, { bg: string; border: string; text: string }> = {
  high: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  medium: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
  low: { bg: '#fefce8', border: '#fde047', text: '#ca8a04' },
  none: { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' },
}

// Main component (WC) 
export default function ConfirmationContent({
  item,
  tableName,
  onBack,
  onSubmit,
  onCreate,
  parentScan,
}: {
  item: any;
  tableName: string;
  onBack: () => void;
  onSubmit: (result: SubmitResult) => void;
  onCreate: (data: {
    name: string; description: string; condition: string;
    location_id: string | null; department_id: string | null;
    category: string; model: string;
    image_base64: string | null; image_mime: string | null;
    created_by: string | null;
  }) => Promise<void>;
  parentScan: { type: string; id: string; name: string } | null;
}) {
  // Logged-in user's staff ID, used to attribute audit log entries (WC)
  const { data: session } = useSession()
  const staffId = (session?.user as any)?.staffId ?? null

  // Guards against a fast double-tap/double-click firing two submissions
  // before the isSubmitting state has re-rendered and disabled the button (WC)
  const isSubmittingRef = useRef(false);

  // State variables (WC)
  const [mode, setMode] = useState<'loading' | 'editing' | 'registering' | 'error'>('loading');
  const [assetDetails, setAssetDetails] = useState<Asset | null>(null);
  const [pageStep, setPageStep] = useState<'confirm' | 'update'>('confirm');
  const [conditionMethod, setConditionMethod] = useState<'manual' | 'ai'>('manual');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown data, select location and department from the dropdown list (WC)
  const [locations,   setLocations]   = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedLocation,   setSelectedLocation]   = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  // Registration fields (WC)
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newModel, setNewModel] = useState('');
  const [registerCondition, setRegisterCondition] = useState<ConditionStatus>('In-use');

  //  Manual update fields, condition, priority, and feedback (WC)
  const [condition, setCondition] = useState<ConditionStatus>('In-use');
  const [maintenanceNeeded, setMaintenanceNeeded] = useState(false);
  const [priority, setPriority] = useState<PriorityLevel>('none');
  const [feedback, setFeedback] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [aiSubmitError,setAiSubmitError] = useState<string | null>(null);

  // Uploaded image state, capture or upload from local storage (WC)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [pendingCameraMode, setPendingCameraMode] = useState<'user' | 'environment' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const errorRef   = useRef<HTMLDivElement>(null);

  //  AI assessment result and loading/error state (WC)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiError, setAiError] = useState<string>('');

  //  Data fetching (WC)
  useEffect(() => {
    const load = async () => {
      if (!item?.code) { 
        setMode('error') 
        setError('Invalid asset data.')
        
        return 
      }

      setMode('loading');

      const [locRes, deptRes] = await Promise.all([
        fetch('/api/location?limit=500'),
        fetch('/api/department?limit=500'),
      ])

      const locJson  = await locRes.json()
      const deptJson = await deptRes.json()
      setLocations(locJson.data   || [])
      setDepartments(deptJson.data || [])

      try {
        // Check if asset exists in the database (WC)
        const params = new URLSearchParams({
          table: 'Asset',
          idColumn: 'asset_id',
          scannedCode: item.code,
        })

        // If asset is not found, we will go to the registering page, otherwise we will show the editing page (WC)
        const res = await fetch(`/api/scanner?${params}`)
        const result = await res.json()

        if (!result.success || !result.data) {
          setMode('registering')
        } else {
          const d = result.data as Asset
          setAssetDetails(d)
          setCondition((d.condition as ConditionStatus) || 'In-use')
          setSelectedLocation(d.location_id || '')
          setSelectedDepartment(d.department_id || '')
          setMode('editing')
        }
      } catch (err: any) {
        setMode('error')
        setError(err.message || 'An unknown error occurred.')
      }
    }
    load()
  }, [item, tableName])

  // Camera setup and handlers (WC)
  useEffect(() => {
    if (pendingCameraMode && videoRef.current) {
      initializeCamera(pendingCameraMode)
      setPendingCameraMode(null)
    }
  }, [pendingCameraMode, showCamera])

  // Cleanup camera stream on unmount (WC)
  const initializeCamera = async (m: 'user' | 'environment') => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: m, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
      })

      if (videoRef.current) { 
        videoRef.current.srcObject = ms
        setStream(ms)
        setFacingMode(m)
      }

    } catch (err) { 
      console.error('Camera error:', err); setShowCamera(false)
    }
  }

  // Start camera with specified mode, default to environment (rear) camera.
  //  Stop camera and release stream when done. Capture photo from video stream and convert to File object for upload (WC)
  const startCamera = (m: 'user' | 'environment' = 'environment') => {
    if (stream) stream.getTracks().forEach(t => t.stop())
    setShowCamera(true)
    setPendingCameraMode(m)
  }

  // Stop camera and release stream (WC)
  const stopCamera = () => {
    if (stream) { 
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
    }

    setShowCamera(false)
  }

  // Toggle between front and rear camera (WC)
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const v = videoRef.current, c = canvasRef.current
      c.width = v.videoWidth; c.height = v.videoHeight
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.drawImage(v, 0, 0)
        c.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setImageFile(file)
            setImagePreview(c.toDataURL('image/jpeg'))
            stopCamera()
          }
        }, 'image/jpeg', 0.95)
      }
    }
  };

  // Handle image file selection from local storage, validate file type and size, and create preview (WC)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    // Only allow jpeg, png, webp under 10MB, you can adjust this as needed (WC)
    const valid = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!valid.includes(file.type) || file.size > 10 * 1024 * 1024) {
      return
    }

    setImageFile(file)
    // Create image preview (WC)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  };

  // Clear selected image and preview, and stop camera if active (WC)
  const clearImage = () => {
    setImageFile(null)
    setImagePreview('')
    stopCamera()
  }

  // Reset AI result and errors when user changes condition or maintenance needed status, 
  // to prompt them to re-analyze if they make changes after an AI assessment (WC)
  const resetAi = () => { 
    setAiResult(null)
    setAiError('')
    clearImage() 
  }

  // Utility function to encode image file to base64 for API upload (WC)
  const encodeImage = (file: File): Promise<{ base64: string; mime: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ base64: (reader.result as string).split(',')[1], mime: file.type });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  //  Handle AI analysis, send image and asset info to API, and display result or error (WC)
  const handleAiAnalyze = async () => {
    if (!imageFile) return;
    if (!selectedLocation) {
      setAiError('Please select a location before analyzing.');
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    if (!selectedDepartment) {
      setAiError('Please select a department before analyzing.');
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    // Reset previous AI result and errors before new analysis (WC)
    setAiLoading(true); setAiError(''); setAiResult(null);
    try {
      const { base64, mime } = await encodeImage(imageFile);
      const res = await fetch('/api/assessAsset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          assetId: assetDetails?.asset_id || item.code,
          locationId: selectedLocation || null,
          userId: staffId,
          mimeType: mime,
        }),
      });
      // Handle non-200 responses with error details from API (WC)
      const data = await res.json();
      // If API returns success false, it means the assessment failed, 
      // we show the error message from API (which could be validation error or processing error),
      //  if available, otherwise show a generic error (WC)
      if (data.success) { setAiResult(data.assessment); }
      else { setAiError(data.detail || data.error || 'AI assessment failed.'); }
    } catch {
      setAiError('Failed to analyze image. Check your connection.');
    } finally {
      setAiLoading(false);
    }
  };

  //  Save assessment to database, this function is used by both manual submit and AI submit handlers. 
  // It sends the assessment data along with the image (if available) to the API route for saving (WC)
  const saveToDb = async (payload: {
    condition_status: string;
    maintenance_needed: boolean;
    priority: string;
    feedback: string | null;
    ai_response: string | null;
    image_file: File | null;
  }) => {
    let image_base64: string | null = null;
    let image_mime: string | null = null;
    if (payload.image_file) {
      const enc = await encodeImage(payload.image_file);
      image_base64 = enc.base64;
      image_mime = enc.mime;
    }
    // Send data to API route for saving, the API will handle inserting the maintenance record,
    //  uploading the image to storage, and updating the asset condition (WC)
    const res = await fetch('/api/saveMaintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: assetDetails?.asset_id || item.code,
        location_id: selectedLocation || null,
        department_id: selectedDepartment || null,
        condition_status: payload.condition_status,
        maintenance_needed: payload.maintenance_needed,
        priority: payload.priority,
        feedback: payload.feedback,
        ai_response: payload.ai_response,
        image_base64,
        image_mime,
        assessed_by: staffId,
      }),
    });
    // The API returns { success: boolean, error?: string },
    //  we return this to the caller to handle success or show error message (WC)
    return res.json();
  };

  // Utility function to scroll to the error message when validation fails (WC)
  const scrollToError = () => {
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  //  Manual submit handler, validate inputs, call saveToDb, 
  // and then call onSubmit with the result to go back to success page (WC)
  const handleManualSubmit = async () => {
    // Guard against a fast double-tap/click firing this twice before
    // isSubmitting re-renders and disables the button (WC)
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setManualError(null); setAiSubmitError(null);

    if (!selectedLocation) {
      setManualError('Please select a location before submitting.'); scrollToError();
      isSubmittingRef.current = false; return;
    }
    if (!selectedDepartment) {
      setManualError('Please select a department before submitting.'); scrollToError();
      isSubmittingRef.current = false; return;
    }
    if (maintenanceNeeded) {
      if (priority === 'none') {
        setManualError('Please select a priority level since maintenance is needed.'); scrollToError();
        isSubmittingRef.current = false; return;
      }
      if (!feedback.trim() || countWords(feedback) === 0) {
        setManualError('Please enter staff feedback before submitting.'); scrollToError();
        isSubmittingRef.current = false; return;
      }
      if (!imageFile) {
        setManualError('Please upload a photo of the asset since maintenance is needed.'); scrollToError();
        isSubmittingRef.current = false; return;
      }
    }
    // Call saveToDb with the assessment data and image, the API will handle saving to database and storage (WC)
    setIsSubmitting(true);
    try {
      const result = await saveToDb({
        condition_status:   condition,
        maintenance_needed: maintenanceNeeded,
        priority: maintenanceNeeded ? priority : 'none',
        feedback: feedback.trim() ? truncateToWords(feedback.trim(), FEEDBACK_MAX_WORDS) : null,
        ai_response: null,
        image_file: imageFile,
      });
      if (!result.success) { setManualError(result.error || 'Failed to save. Please try again.'); scrollToError(); return; }
      onSubmit({
        asset_id: assetDetails?.asset_id || item.code,
        name: assetDetails?.name || 'N/A',
        category: assetDetails?.category || 'N/A',
        model: assetDetails?.model || 'N/A',
        condition,
        location_id: selectedLocation || null,
        department_id: selectedDepartment || null,
        submitType: 'manual',
      });
    } 
    // Catch any unexpected errors that occur during the save process, such as network errors, 
    // and show a generic error message (WC)
    catch { setManualError('Unexpected error. Check your connection.'); scrollToError(); } 
    finally  { setIsSubmitting(false); isSubmittingRef.current = false; }
  };

  // AI submit handler, similar to manual submit but uses AI result,
  // validate that AI result exists and required fields are selected (WC)
  const handleAiSubmit = async () => {
    if (!aiResult || isSubmitting) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setManualError(null); setAiSubmitError(null);

    if (!selectedLocation) {
      setAiSubmitError('Please select a location before submitting.'); scrollToError();
      isSubmittingRef.current = false; return;
    }
    if (!selectedDepartment) {
      setAiSubmitError('Please select a department before submitting.'); scrollToError();
      isSubmittingRef.current = false; return;
    }

    setIsSubmitting(true);
    try {
      // Call saveToDb with AI assessment data and image, the API will handle saving to database and storage (WC)
      const result = await saveToDb({
        condition_status: aiResult.condition,
        maintenance_needed: aiResult.maintenanceNeeded ?? false,
        priority: aiResult.priority ?? 'none',
        feedback: null,
        ai_response: truncateToWords(aiResult.fullResponse, FEEDBACK_MAX_WORDS) || null,
        image_file: imageFile,
      });
      if (!result.success) { setAiSubmitError(result.error || 'Failed to save. Please try again.'); scrollToError(); return; }
      onSubmit({
        asset_id: assetDetails?.asset_id  || item.code,
        name: assetDetails?.name || 'N/A',
        category: assetDetails?.category || 'N/A',
        model: assetDetails?.model || 'N/A',
        condition: aiResult.condition,
        location_id: selectedLocation || null,
        department_id: selectedDepartment || null,
        submitType: 'ai',
      });
    } catch { setAiSubmitError('Unexpected error. Check your connection.'); scrollToError(); }
    finally  { setIsSubmitting(false); isSubmittingRef.current = false; }
  };

  // Registration submit handler, validate inputs, call onCreate to create new asset (WC)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newCategory || !newModel) {
      alert('Please fill in all required fields: Asset Name, Category, and Model.');
      return;
    }

    // Encode the captured/uploaded photo (if any) so it can be uploaded
    // to the AssetImage bucket by the scanner API route (WC)
    let image_base64: string | null = null;
    let image_mime: string | null = null;
    if (imageFile) {
      const enc = await encodeImage(imageFile);
      image_base64 = enc.base64;
      image_mime = enc.mime;
    }

    await onCreate({
      name: newName, description: newDescription, condition: registerCondition,
      location_id: selectedLocation || null,
      department_id: selectedDepartment || null,
      category: newCategory, model: newModel,
      image_base64,
      image_mime,
      created_by: staffId,
    });
  };

  // Render functions for different sections of the UI, such as image upload,
  //  AI result display, manual input form, etc. (WC)
  const renderImageSection = (required = false) => (
    <div>
      <label className="text-sm font-semibold text-gray-700 block mb-2">
        Asset Photo{' '}
        {required
          ? <span className="text-red-500">*</span>
          : <span className="text-gray-400 font-normal">(Optional)</span>}
      </label>
      {!imageFile && !showCamera && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => startCamera('environment')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Open Camera
          </button>
          <div className="text-center text-gray-400 text-xs">OR</div>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #e5e7eb', borderRadius: 12, padding: '20px', cursor: 'pointer', background: '#fafafa', gap: 8 }}>
            <Upload size={28} color="#9ca3af" />
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Click to upload</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>JPEG, PNG, WebP (max 10MB)</span>
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleImageChange} style={{ display: 'none' }} />
          </label>
        </div>
      )}
      {showCamera && (
        <div className="space-y-3">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: 300 }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto object-contain" style={{ minHeight: 300, maxHeight: 500, display: 'block' }} />
            <button
              type="button"
              onClick={() => startCamera(facingMode === 'user' ? 'environment' : 'user')}
              className="absolute top-4 right-4 bg-white bg-opacity-80 p-3 rounded-full shadow-lg hover:bg-opacity-100 transition-all"
            >
              <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={capturePhoto}
              className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Capture Photo
            </button>
            <button type="button" onClick={stopCamera} className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      {imageFile && imagePreview && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={imagePreview} alt="Preview" className="w-full h-48 object-contain" />
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-xs text-gray-600">{imageFile.name} • {(imageFile.size / 1024).toFixed(1)} KB</span>
            <button type="button" onClick={clearImage} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
          </div>
        </div>
      )}
    </div>
  );

  // Utility function to get badge styles based on condition status, 
  // used for displaying current condition and AI predicted condition (WC)
  const getConditionBadge = (cond: string) => {
    const base = 'px-3 py-1 rounded-full text-sm font-bold';
    if (cond === 'In-use') return `${base} bg-green-100 text-green-800 border border-green-300`;
    if (cond === 'Spoiled') return `${base} bg-red-100 text-red-800 border border-red-300`;
    return `${base} bg-yellow-100 text-yellow-800 border border-yellow-300`;
  };

  // Confirmation, show asset details and current location/department, 
  // and allow user to confirm before going to update page (WC)
  const renderConfirmStep = () => {
    const locationName = locations.find(l => l.location_id === assetDetails?.location_id)?.name || assetDetails?.location_id || '—';
    const deptName = departments.find(d => d.department_id === assetDetails?.department_id)?.name || assetDetails?.department_id || '—';
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Asset Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[['Name', assetDetails?.name], ['Asset ID', assetDetails?.asset_id], ['Category', assetDetails?.category], ['Model', assetDetails?.model]].map(([label, val]) => (
              <div key={label}>
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <p className="text-base text-gray-800 mt-0.5 font-mono">{val || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Location Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
              <div><p className="text-sm font-medium text-gray-500">Location</p><p className="text-base text-gray-800 mt-0.5">{locationName}</p></div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
              <div><p className="text-sm font-medium text-gray-500">Department</p><p className="text-base text-gray-800 mt-0.5">{deptName}</p></div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">Current Condition:</span>
          <span className={getConditionBadge(assetDetails?.condition || 'In-use')}>{assetDetails?.condition || 'In-use'}</span>
        </div>
      </div>
    );
  };

  // Update step, show dropdowns to update location and department,
  // show current condition with badge, and allow user to choose manual or AI assessment (WC)
  const renderUpdateStep = () => (
    <div className="p-4 lg:p-6 space-y-4">

      {/* Asset summary pill */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-lg">
        <div>
          <p className="text-sm font-semibold text-gray-800">{assetDetails?.name}</p>
          <p className="text-xs font-mono text-gray-500">{assetDetails?.asset_id}</p>
        </div>
        <span className={getConditionBadge(assetDetails?.condition || 'In-use')}>{assetDetails?.condition || 'In-use'}</span>
      </div>

      {/* Update Location & Department */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-600" /> Update Location
          </h3>
          {aiLoading && (
            <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 px-2 py-1 rounded-full font-medium">
              🔒 Locked during analysis
            </span>
          )}
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-1">
              <MapPin className="w-4 h-4" /> Location <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              disabled={aiLoading}
              className={`w-full p-3 border-2 rounded-lg focus:outline-none text-gray-800 ${aiLoading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white border-gray-300 focus:border-red-500'}`}
            >
              <option value="">-- None --</option>
              {/* Commented by Desmond @ 25-May-26: Fixed it so that location will display id and name */}
              {
                locations.map(loc => 
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.location_id} - {loc.name}
                  </option>)
              }
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-1">
              <Building2 className="w-4 h-4" /> Department <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={aiLoading}
              className={`w-full p-3 border-2 rounded-lg focus:outline-none text-gray-800 ${aiLoading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white border-gray-300 focus:border-red-500'}`}
            >
              <option value="">-- None --</option>
              {departments.map(dept => <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Validation error banner */}
      {(manualError || aiSubmitError || aiError) && (
        <div ref={errorRef} className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-400 text-yellow-800 rounded-lg text-sm font-medium">
          ⚠ {manualError || aiSubmitError || aiError}
        </div>
      )}

      {/* Asset Condition — method toggle */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Asset Condition</h3>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
            <button
              type="button"
              onClick={() => { setConditionMethod('manual'); setManualError(null); setAiSubmitError(null); setAiError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, transition: 'all 0.15s',
                background: conditionMethod === 'manual' ? 'white' : 'transparent',
                color: conditionMethod === 'manual' ? '#111' : '#9ca3af',
                boxShadow: conditionMethod === 'manual' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}
            >
              <PenLine size={13} /> Manual
            </button>
            <button
              type="button"
              onClick={() => { setConditionMethod('ai'); resetAi(); setManualError(null); setAiSubmitError(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, transition: 'all 0.15s',
                background: conditionMethod === 'ai' ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'transparent',
                color: conditionMethod === 'ai' ? 'white' : '#9ca3af',
                boxShadow: conditionMethod === 'ai' ? '0 1px 6px rgba(79,70,229,0.3)' : 'none' }}
            >
              <Sparkles size={13} /> AI Assist
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">

          {/* ── MANUAL ── */}
          {conditionMethod === 'manual' && (
            <div className="space-y-5">

              {/* Condition */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Condition Status <span className="text-red-500">*</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {conditionOptions.map(opt => (
                    <label key={opt} style={{ flex: 1, border: `2px solid ${condition === opt ? '#dc2626' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center', cursor: 'pointer', background: condition === opt ? '#fef2f2' : 'white', color: condition === opt ? '#dc2626' : '#374151', fontWeight: 600, fontSize: 13, transition: 'all 0.15s' }}>
                      <input type="radio" name="condition" value={opt} checked={condition === opt} onChange={() => setCondition(opt)} style={{ display: 'none' }} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Maintenance */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Maintenance Needed?</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(({ label, val }) => (
                    <label key={label} style={{ flex: 1, border: `2px solid ${maintenanceNeeded === val ? '#dc2626' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center', cursor: 'pointer', background: maintenanceNeeded === val ? '#fef2f2' : 'white', color: maintenanceNeeded === val ? '#dc2626' : '#374151', fontWeight: 600, fontSize: 13 }}>
                      <input type="radio" checked={maintenanceNeeded === val} onChange={() => setMaintenanceNeeded(val)} style={{ display: 'none' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Priority — only when maintenance needed */}
              {maintenanceNeeded && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Priority <span className="text-red-500">*</span></label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['low', 'medium', 'high'] as PriorityLevel[]).map(p => (
                      <label key={p} style={{ flex: 1, border: `2px solid ${priority === p ? priorityColors[p].border : '#e5e7eb'}`, borderRadius: 10, padding: '8px', textAlign: 'center', cursor: 'pointer', background: priority === p ? priorityColors[p].bg : 'white', color: priority === p ? priorityColors[p].text : '#374151', fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>
                        <input type="radio" checked={priority === p} onChange={() => setPriority(p)} style={{ display: 'none' }} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  Staff Feedback {maintenanceNeeded && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => {
                    const s = sanitizeFeedback(e.target.value);
                    setFeedback(countWords(s) <= FEEDBACK_MAX_WORDS ? s : truncateToWords(s, FEEDBACK_MAX_WORDS));
                    if (s.trim()) setManualError(null);
                  }}
                  rows={3}
                  placeholder="Describe the asset condition e.g. chair leg is loose, screen has cracks..."
                  className={`w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none ${manualError ? 'border-red-500' : countWords(feedback) >= FEEDBACK_MAX_WORDS ? 'border-orange-400' : 'border-gray-300'}`}
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-400">Letters, numbers and basic punctuation only</span>
                  <span className={`text-xs font-semibold ${countWords(feedback) >= FEEDBACK_MAX_WORDS ? 'text-orange-500' : 'text-gray-400'}`}>
                    {countWords(feedback)} / {FEEDBACK_MAX_WORDS} words
                  </span>
                </div>
              </div>

              {/* Image — required only when maintenance needed */}
              {renderImageSection(maintenanceNeeded)}

              {/* Submit button — inline, inside manual section */}
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={isSubmitting}
                className={`w-full py-3 rounded-lg font-bold transition-colors ${isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {isSubmitting ? 'Saving...' : 'Submit Manual Assessment'}
              </button>
            </div>
          )}

          {/* ── AI ASSIST ── */}
          {conditionMethod === 'ai' && (
            <div style={{ border: '2px solid #e0e7ff', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={15} color="white" />
                <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>Gemini AI Assessment</span>
                <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>Auto-analyze</span>
              </div>
              <div style={{ padding: 16, background: '#fafafe' }} className="space-y-4">

                {/* Upload image — shown until result arrives */}
                {!aiResult && (
                  <>
                    {renderImageSection(true)}
                    {imageFile && !aiLoading && (
                      <button
                        type="button"
                        onClick={handleAiAnalyze}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white', border: 'none', borderRadius: 10, padding: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Sparkles size={15} /> Analyze with AI
                      </button>
                    )}
                    {aiLoading && (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ width: 44, height: 44, border: '3px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        <div style={{ fontWeight: 700, color: '#4f46e5', fontSize: 14 }}>Analyzing asset condition...</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>AI is reviewing the image</div>
                      </div>
                    )}
                  </>
                )}

                {/* AI result */}
                {aiResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: priorityColors[aiResult.priority as PriorityLevel]?.bg ?? '#f0fdf4', border: `1.5px solid ${priorityColors[aiResult.priority as PriorityLevel]?.border ?? '#86efac'}`, borderRadius: 10, padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Priority</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: priorityColors[aiResult.priority as PriorityLevel]?.text ?? '#16a34a', marginTop: 2, textTransform: 'capitalize' }}>{aiResult.priority}</div>
                      </div>
                      <div style={{ background: aiResult.maintenanceNeeded ? '#fff7ed' : '#f0fdf4', border: `1.5px solid ${aiResult.maintenanceNeeded ? '#fdba74' : '#86efac'}`, borderRadius: 10, padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Maintenance</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: aiResult.maintenanceNeeded ? '#ea580c' : '#16a34a', marginTop: 2 }}>
                          {aiResult.maintenanceNeeded ? '⚠️ Needed' : '✓ Not needed'}
                        </div>
                      </div>
                    </div>
                    {aiResult.issues?.length > 0 && (
                      <div style={{ background: 'white', border: '1.5px solid #e0e7ff', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', marginBottom: 6 }}>Issues Detected</div>
                        {aiResult.issues.map((issue: string, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: '#4f46e5' }}>•</span> {issue}
                          </div>
                        ))}
                      </div>
                    )}
                    {aiResult.fullResponse && (
                      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>AI Summary</div>
                        <div style={{ fontSize: 12, color: '#475569' }}>{truncateToWords(aiResult.fullResponse, FEEDBACK_MAX_WORDS)}</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleAiSubmit}
                        disabled={isSubmitting}
                        style={{ flex: 1, background: isSubmitting ? '#d1d5db' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white', border: 'none', borderRadius: 10, padding: 11, cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <CheckCircle size={15} /> {isSubmitting ? 'Saving...' : 'Submit AI Assessment'}
                      </button>
                      <button
                        type="button"
                        onClick={resetAi}
                        style={{ padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render dropdown selectors for location and department,
  // with icons and conditional display based on parent scan type (WC)
  const renderDropdownSelectors = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(!parentScan || parentScan.type !== 'location') && (
        <div>
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <MapPin className="w-4 h-4" /> Location (Optional)
          </label>
          <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg mt-1">
            <option value="">-- None --</option>
            {/* Commented by Desmond @ 25-May-26: Fixed it so that location will display id and name */}
              {
                locations.map(loc => 
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.location_id} - {loc.name}
                  </option>)
              }
          </select>
        </div>
      )}
      {(!parentScan || parentScan.type !== 'department') && (
        <div>
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Building2 className="w-4 h-4" /> Department (Optional)
          </label>
          <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg mt-1">
            <option value="">-- None --</option>
            {departments.map(dept => <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )

  const renderRegisteringContent = () => (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-300 text-blue-800 rounded-lg text-center">
        <strong className="flex items-center justify-center gap-2"><PackagePlus className="w-5 h-5" /> New Asset</strong>
        <p>This Asset ID was not found. Please register it.</p>
      </div>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Register New Asset</h3>
        <div>
          <label className="text-sm font-medium text-gray-500">Asset ID</label>
          <p className="text-lg text-gray-800 font-mono p-2 bg-gray-100 rounded">{item?.code}</p>
        </div>
        <div>
          <label htmlFor="assetName" className="text-sm font-medium text-gray-700">Asset Name (Required)</label>
          <input id="assetName" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required
            className="w-full p-2 border border-gray-300 rounded-lg mt-1" placeholder="e.g., Dell Latitude 5420" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="assetCategory" className="text-sm font-medium text-gray-700">Category (Required)</label>
            <input id="assetCategory" type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} required
              className="w-full p-2 border border-gray-300 rounded-lg mt-1" placeholder="e.g., Laptop" />
          </div>
          <div>
            <label htmlFor="assetModel" className="text-sm font-medium text-gray-700">Model (Required)</label>
            <input id="assetModel" type="text" value={newModel} onChange={(e) => setNewModel(e.target.value)} required
              className="w-full p-2 border border-gray-300 rounded-lg mt-1" placeholder="e.g., Latitude 5420" />
          </div>
        </div>
        <div>
          <label htmlFor="assetDesc" className="text-sm font-medium text-gray-700">Description</label>
          <textarea id="assetDesc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg mt-1" rows={3} placeholder="e.g., 14-inch laptop, 16GB RAM" />
        </div>
        {renderDropdownSelectors()}
      </div>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Set Initial Condition</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          {conditionOptions.map(opt => (
            <label key={opt} className={`flex-1 p-4 border-2 rounded-lg cursor-pointer transition-all ${registerCondition === opt ? 'border-red-600 bg-red-50 shadow-md' : 'border-gray-300 hover:border-gray-400'}`}>
              <input type="radio" name="registerCondition" value={opt} checked={registerCondition === opt} onChange={() => setRegisterCondition(opt)} className="sr-only" />
              <span className="text-lg font-medium text-gray-800">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )

  // Render main content based on current mode and page step, 
  // showing loading state, error message, confirmation details, or update form as needed (WC)
  const renderFormContent = () => {
    if (mode === 'loading') return <div className="p-8 text-center text-gray-500">Searching for asset...</div>
    if (mode === 'error') return (
      <div className="p-8">
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center">
          <strong className="flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5" /> Error</strong>
          <p>{error}</p>
        </div>
      </div>
    )
    if (mode === 'editing') return pageStep === 'confirm' ? renderConfirmStep() : renderUpdateStep()
    if (mode === 'registering') return renderRegisteringContent()
    return null
  }

  // Get header title based on mode and page step, to provide clear context to user (WC)
  const getHeaderTitle = () => {
    if (mode === 'registering') return 'Register Asset'
    if (mode === 'editing' && pageStep === 'update') return 'Update Asset'
    return 'Confirm Asset'
  }

  // Bottom buttons 
  const renderButtons = () => {
    if (mode === 'loading' || mode === 'error') {
      return (
        <button type="button" onClick={onBack} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium shadow-md">
          <ChevronLeft className="w-5 h-5" /> Back to Scan
        </button>
      )
    }
    if (mode === 'editing' && pageStep === 'confirm') {
      return (
        <>
          <button type="button" onClick={onBack} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium shadow-md">
            <ChevronLeft className="w-5 h-5" /> Back
          </button>
          <button type="button" onClick={() => setPageStep('update')} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-md">
            <Edit className="w-5 h-5" /> Update Asset
          </button>
        </>
      )
    }
    if (mode === 'editing' && pageStep === 'update') {
      return (
        <button
          type="button"
          onClick={() => {
            setPageStep('confirm')
            setConditionMethod('manual')
            clearImage()
            setManualError(null)
            setAiError('')
            setAiSubmitError(null)
            resetAi()
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium shadow-md"
        >
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
      )
    }
    if (mode === 'registering') {
      return (
        <>
          <button type="button" onClick={onBack} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium shadow-md">
            <ChevronLeft className="w-5 h-5" /> Back to Scan
          </button>
          <button type="submit" className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md">
            <Save className="w-5 h-5" /> Register New Asset
          </button>
        </>
      )
    }
    return null
  }

  // Main render with conditional content and buttons based on mode and page step, 
  // wrapped in a form for handling submissions (WC) 
  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={mode === 'registering' ? handleRegisterSubmit : (e) => e.preventDefault()}>
          <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-red-700 to-red-500 text-white">
              <div className="flex items-center gap-3">
                <Edit className="w-8 h-8" />
                <div>
                  <h1 className="text-2xl font-bold">{getHeaderTitle()}</h1>
                  <p className="text-sm text-red-100">Scanned Code: {item?.code}</p>
                </div>
              </div>
            </div>
            {renderFormContent()}
          </div>
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-4 lg:px-6 py-4 bg-gray-50">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {renderButtons()}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}