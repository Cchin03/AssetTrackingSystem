import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { AiProvider, AiAssessmentResult } from '../aiProvider';

// GeminiProvider implements AiProvider using free Google Gemini API for asset condition assessment.
export class GeminiProvider implements AiProvider {
  private model: GenerativeModel;
  // Initialize Gemini API client and model in the constructor, throwing an error if the API key is missing (WC)
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables');
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });    
    console.log('GeminiProvider initialized successfully');
  }

  //  Main method to assess asset condition from an image, with detailed logging and error handling (WC)
  async assessAssetCondition(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
  ): Promise<AiAssessmentResult> {
    console.log('=== GeminiProvider: assessAssetCondition Started ===');
    console.log('Image base64 length:', imageBase64?.length);
    console.log('MIME type:', mimeType);

    try {
      // Identify the asset 
      console.log('Step 1: Identifying asset type...');
      const identification = await this.withRetry(() =>
        this.identifyAsset(imageBase64, mimeType)
      );
      console.log('Identification result:', identification);

      if (!identification.isValidAsset) {
        throw new Error(
          `INVALID_ASSET: The image does not show a recognised asset. ` +
          `Detected: "${identification.detectedAsset}". ` +
          `Reason: ${identification.reason}. ` +
          `Accepted assets: Chair, Table, Whiteboard, Laptop, Desktop, Monitor, CPU, Mouse, Keyboard.`
        );
      }

      console.log(`Valid asset detected: ${identification.detectedAsset}`);

      // Asset-specific condition assessment 
      const assetCriteria = this.getAssetCriteria(identification.detectedAsset);

      const assessmentPrompt = `You are a certified facility asset inspector. You have identified the asset in this image as: ${identification.detectedAsset}.

Perform a detailed condition assessment using ONLY the criteria relevant to this asset type.

ASSESSMENT CRITERIA FOR ${identification.detectedAsset.toUpperCase()}:
${assetCriteria}

STATUS DEFINITIONS (choose exactly one):
- In-use: Asset is in good working condition with no or only cosmetic issues. Safe to use daily.
- In-store: Asset has minor wear or non-critical issues. Functional but better suited for backup/storage use.
- Spoiled: Asset is damaged, broken, unsafe, or beyond reasonable repair. Needs immediate removal or disposal.

PRIORITY DEFINITIONS:
- None: No maintenance required
- Low: Cosmetic issues only, can be scheduled for next routine maintenance
- Medium: Functional issues that should be addressed within 1–2 weeks
- High: Safety risk or asset unusable — address within 24–48 hours

Format your response EXACTLY as follows (no extra text before or after):
STATUS: [In-use/In-store/Spoiled]
MAINTENANCE: [Yes/No]
PRIORITY: [None/Low/Medium/High]
ISSUES:
- [specific issue 1 referencing the asset type]
- [specific issue 2 referencing the asset type]
- [specific issue 3 referencing the asset type]

Important rules:
1. List ONLY issues actually visible in the image — do not guess or invent
2. If the asset looks fine, write "No visible defects detected" as the single issue
3. Always match STATUS and PRIORITY consistently (e.g. Spoiled must be High or Medium)
4. Battery swelling on any electronic = always Spoiled + High`;

      console.log('Step 2: Running condition assessment...');
      const result = await this.withRetry(() =>
        this.model.generateContent([
          assessmentPrompt,
          { inlineData: { data: imageBase64, mimeType } },
        ])
      );

      console.log('Gemini API responded successfully');
      const responseText = result.response.text();
      console.log('Response text:', responseText);

      const parsed = this.parseAssessmentResponse(responseText);
      console.log('Parsed result:', parsed);

      return {
        condition: parsed.condition,
        maintenanceNeeded: parsed.maintenanceNeeded,
        priority: parsed.priority,
        issues: parsed.issues,
        fullResponse: `[Asset: ${identification.detectedAsset}]\n\n${responseText}`,
      };

    } catch (error: any) {
      if (error?.message?.startsWith('INVALID_ASSET:')) {
        throw error;
      }

      console.error('=== GeminiProvider Error ===');
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error status:', error?.status);
      console.error('Full error:', JSON.stringify(error, null, 2));

      throw new Error(
        `Gemini API Error: ${error?.message || 'Unknown error'} (Status: ${error?.status || 'N/A'})`
      );
    }
  }

  // Helper method to retry API calls on transient 503 errors, with exponential backoff (WC)
  private async withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    baseDelayMs = 2000
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const is503 =
          err?.status === 503 ||
          err?.message?.includes('503') ||
          err?.message?.includes('Service Unavailable');
        if (is503 && attempt < retries) {
          const delay = baseDelayMs * attempt;
          console.warn(`Gemini 503 — attempt ${attempt}/${retries}, retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Gemini retry limit reached');
  }

  // Sends a prompt to Gemini to identify the asset type in the image, returning structured results.(WC)
  private async identifyAsset(
    imageBase64: string,
    mimeType: string
  ): Promise<{ isValidAsset: boolean; detectedAsset: string; reason: string }> {
    const identificationPrompt = `You are an asset identification system for a facility management tool.

Look at this image and determine if it contains ONE of the following recognised asset types:
- Chair (office chair, plastic chair, foldable chair, stool)
- Table (desk, dining table, meeting table, workstation)
- Whiteboard (wall-mounted or portable)
- Laptop
- Desktop computer (tower/mini PC unit)
- Monitor (computer screen/display)
- CPU (computer tower unit, separate from monitor)
- Mouse (computer mouse)
- Keyboard (computer keyboard)

 Respond ONLY in this exact format (no extra text):
IS_VALID_ASSET: [Yes/No]
DETECTED_ASSET: [exact asset name from the list above, or "Unknown" if not found]
REASON: [one sentence explaining your decision]`;
    // Send the image to Gemini with the identification prompt, 
    // and parse the structured response to determine if it's a valid asset and what type it is (WC)
    const result = await this.model.generateContent([
      identificationPrompt,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const text = result.response.text();

    const isValid = /IS_VALID_ASSET:\s*Yes/i.test(text);
    const assetMatch = text.match(/DETECTED_ASSET:\s*(.+)/i);
    const reasonMatch = text.match(/REASON:\s*(.+)/i);

    return {
      isValidAsset: isValid,
      detectedAsset: assetMatch?.[1]?.trim() ?? 'Unknown',
      reason: reasonMatch?.[1]?.trim() ?? 'No reason provided',
    };
  }

  // Returns asset-specific inspection criteria for the assessment prompt.
  private getAssetCriteria(assetType: string): string {
  //  Provides detailed, asset-specific condition criteria to guide Gemini's assessment, improving accuracy and relevance of results (WC)
    const criteria: Record<string, string> = {
      Chair: `
- Structural: cracks or breaks in frame/legs, wobbling legs, bent metal parts
- Seating: torn/stained upholstery, foam exposed, broken armrests
- Mechanism: non-adjustable height, broken tilt/recline, missing casters/wheels
- Safety: sharp edges, unstable base, risk of collapse`,

      Table: `
- Surface: deep scratches, stains, chips, water damage, laminate peeling
- Structure: cracked/broken top, uneven surface, wobbly legs
- Frame: bent/broken legs, missing leg caps, loose joints
- Safety: sharp broken edges, structural instability`,

      Whiteboard: `
- Surface: permanent stains/ghosting, deep scratches, non-erasable marks
- Frame: bent/broken frame or tray, damaged corners
- Mounting: loose/damaged wall fixings (if wall-mounted), unstable stand (if portable)
- Usability: surface no longer accepts markers cleanly`,

      Laptop: `
- Screen: cracks, dead pixels, flickering, hinge damage
- Body: cracked casing, missing keys, damaged ports, dents
- Battery: visible swelling (safety risk — mark Spoiled immediately)
- Functionality indicators: visible burn marks, liquid damage signs`,

      'Desktop computer': `
- Casing: cracks, dents, missing panels, heavy dust buildup inside vents
- Ports: visibly broken USB/power/display ports
- Cables: frayed or exposed wiring attached to unit
- Physical damage: signs of liquid damage, burn marks, rust`,

      Monitor: `
- Screen: cracks, dead pixels, burn-in, flickering, discoloration
- Stand: broken tilt/swivel, unstable base, missing parts
- Ports: damaged HDMI/DP/USB ports
- Casing: cracked bezel, missing screws, physical damage`,

      CPU: `
- Casing: cracks, heavy dents, missing side panels
- Ports: bent/broken USB, audio, power ports
- Ventilation: blocked or damaged fans, heavy dust
- Signs of damage: burn marks, rust, liquid damage indicators`,

      Mouse: `
- Buttons: stuck, unresponsive, or physically broken clicks
- Scroll wheel: missing, stuck, or not scrolling
- Body: cracked casing, missing parts, exposed wiring
- Connectivity: visibly frayed cable (wired) or missing battery cover (wireless)`,

      Keyboard: `
- Keys: missing, stuck, or broken keycaps; non-responsive keys
- Body: cracked casing, liquid damage/stains between keys
- Cable: frayed or damaged USB cable
- General: heavy dirt/debris buildup, missing feet/stands`,
    };

    // Fuzzy match like "office chair" is Chair criteria
    for (const [key, value] of Object.entries(criteria)) {
      if (assetType.toLowerCase().includes(key.toLowerCase())) return value;
    }

    return '- General condition: check for visible damage, wear, or safety concerns';
  }

  // Parses the structured text response from Gemini into typed fields.
  private parseAssessmentResponse(response: string): {
    condition: 'In-use' | 'In-store' | 'Spoiled';
    maintenanceNeeded: boolean;
    priority: 'none' | 'low' | 'medium' | 'high';
    issues: string[];
  } {
    const statusMatch = response.match(/STATUS:\s*(In-use|In-store|Spoiled)/i);
    const maintenanceMatch = response.match(/MAINTENANCE:\s*(Yes|No)/i);
    const priorityMatch = response.match(/PRIORITY:\s*(None|Low|Medium|High)/i);

    const issuesSection = response.split('ISSUES:')[1] || '';
    const issues = issuesSection
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.trim().substring(1).trim())
      .filter(issue => issue.length > 0)
      .slice(0, 3);

    // Default to "In-store" if STATUS is missing or unrecognized, to avoid false "In-use" classifications.
    let condition: 'In-use' | 'In-store' | 'Spoiled' = 'In-store';
    if (statusMatch) {
      const matched = statusMatch[1];
      if (matched === 'In-use' || matched === 'In-store' || matched === 'Spoiled') {
        condition = matched;
      }
    }

    return {
      condition,
      maintenanceNeeded: maintenanceMatch?.[1]?.toLowerCase() === 'yes',
      priority: (priorityMatch?.[1]?.toLowerCase() as 'none' | 'low' | 'medium' | 'high') || 'none',
      issues: issues.length > 0 ? issues : ['No specific issues detected'],
    };
  }
}