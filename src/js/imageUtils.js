
/**
 * Image Utilities
 * Handles compression and resizing of base64 images
 */

/**
 * Compresses a base64 image string
 * @param {string} base64Str - The source base64 string
 * @param {number} maxWidth - Maximum width for resizing
 * @param {number} maxHeight - Maximum height for resizing
 * @param {number} quality - Compression quality (0 to 1)
 * @returns {Promise<string>} - Compressed base64 string
 */
export function compressImage(base64Str, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG for signatures (background will be white but size is much smaller)
            // Or PNG if transparency is critical, but JPEG is better for size.
            // Let's use JPEG for better compression, quality 0.7 is usually fine.
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
        };
        img.onerror = (error) => reject(error);
    });
}
