function loadExternalScript(url: string, placement: 'head' | 'body' = 'body', defer = true): void {
  if (!document.querySelector(`script[src="${url}"]`)) {
    const script = document.createElement('script');
    script.src = url;
    if (defer) script.defer = true;

    if (placement === 'head') {
      document.head.appendChild(script);
    } else if (placement === 'body') {
      document.body.appendChild(script);
    } else {
      console.error('Invalid placement. Use "head" or "body".');
      return;
    }
  }
}

window.loadExternalScript = loadExternalScript;
