/**
 * Helper function to load external scripts only once on a page
 *
 * @param url URL of the script to load
 * @param placement 'head' or 'body'
 * @param defer boolean to indicate if the script should be deferred
 * @param scriptName Optional name to identify the script for event dispatching
 * @returns Promise that resolves when the script is loaded
 */
export function loadExternalScript(
  url: string,
  placement: 'head' | 'body' = 'body',
  defer: boolean = true,
  scriptName: string | undefined = undefined
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if script already exists
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    if (defer) script.defer = true;

    script.addEventListener('load', () => {
      // Dispatch event once the script is loaded
      if (scriptName) {
        const event = new CustomEvent(`scriptLoaded:${scriptName}`, {
          detail: { url, scriptName },
        });
        document.dispatchEvent(event);
      }
      resolve();
    });

    script.addEventListener('error', (error) => {
      reject(new Error(`Failed to load script: ${url}`));
    });

    // Append script to appropriate location
    if (placement === 'head') {
      document.head.appendChild(script);
    } else if (placement === 'body') {
      document.body.appendChild(script);
    } else {
      reject(new Error('Invalid script placement. Use "head" or "body".'));
    }
  });
}

// Make the function globally available
window.loadExternalScript = loadExternalScript;
