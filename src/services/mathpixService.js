const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const MATHPIX_URL = 'https://api.mathpix.com/v3/text';

const getMathpixCredentials = () => {
  const appId = process.env.MATHPIX_API_ID;
  const appKey = process.env.MATHPIX_API_KEY;

  if (!appId || !appKey) {
    throw new Error('Mathpix credentials are not configured');
  }

  return { appId, appKey };
};

const buildPayload = (src) => ({
  src,
  ocr: ['math', 'text'],
  formats: ['text', 'data', 'latex_styled'],
  data_options: {
    include_latex: true,
    include_asciimath: true,
  },
  math_inline_delimiters: ['$', '$'],
  math_display_delimiters: ['$$', '$$'],
  rm_spaces: true,
});

exports.processImage = async (src) => {
  const { appId, appKey } = getMathpixCredentials();
  
  try {
    const response = await fetch(MATHPIX_URL, {
      method: 'POST',
      headers: {
        'app_id': appId,
        'app_key': appKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload(src)),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Mathpix API Error Response:', result);
      const msg = result?.error || result?.message || `Mathpix request failed (${response.status})`;
      throw new Error(msg);
    }

    return {
      text: result.text || '',
      latex: result.latex_styled || '',
      raw: result,
    };
  } catch (error) {
    console.error('Mathpix Service Exception:', error.message);
    throw error;
  }
};
