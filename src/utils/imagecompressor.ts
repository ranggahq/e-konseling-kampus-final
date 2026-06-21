/**
 * Reusable utility to compress and resize a base64 encoded photo to light size (JPEG).
 * Prevents payload truncation errors in databases and limits localStorage consumption.
 */
export const compressAndResizeImage = (base64Str: string, maxWidth: number = 240, maxHeight: number = 240, quality: number = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    // Basic check for empty or non-image outputs
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate optimized bounding dimensions while preserving aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // High-quality rendering pipeline
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to highly compressed JPEG
        const result = canvas.toDataURL('image/jpeg', quality);
        resolve(result);
      } else {
        resolve(base64Str);
      }
    };
    
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};
