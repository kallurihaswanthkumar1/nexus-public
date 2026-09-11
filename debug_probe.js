(async () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/'
  };

  const pageRes = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  console.log('page status', pageRes.status, pageRes.statusText);
  console.log('cookie', pageRes.headers.get('set-cookie'));
  const page = await pageRes.text();
  console.log('page length', page.length);
  const match = page.match(/\"baseUrl\":\"((?:\\\\.|[^\"\\\\])+)\"/);
  console.log('baseUrl match', !!match);
  if (match) {
    const raw = match[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
    console.log('raw baseUrl start', raw.slice(0, 300));
    const res = await fetch(raw, {
      headers: {
        'User-Agent': headers['User-Agent'],
        'Accept-Language': headers['Accept-Language'],
        'Referer': headers['Referer'],
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': '2.20260907.06.00',
        'Accept': '*/*',
        'Cookie': pageRes.headers.get('set-cookie') || ''
      },
      signal: AbortSignal.timeout(30000)
    });
    console.log('timedtext status', res.status, res.statusText, res.headers.get('content-type'));
    const text = await res.text();
    console.log('timedtext sample', text.slice(0, 500));
  }
})();
