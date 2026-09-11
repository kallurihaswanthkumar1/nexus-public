(async () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/'
  };
  const pageRes = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  const page = await pageRes.text();
  const cookie = pageRes.headers.get('set-cookie') || '';
  const patterns = [
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"audioTracks"|,\s*"translationLanguages"|,\s*"defaultAudioTrack"|\}\s*[,}])/, 
    /"playerCaptionsTracklistRenderer"\s*:\s*\{\s*"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"audioTracks"|,\s*"translationLanguages"|\}\s*[,}])/, 
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*\}/
  ];

  let match = null;
  for (const pattern of patterns) {
    match = page.match(pattern);
    if (match) break;
  }

  console.log('pattern found?', !!match);
  if (!match) return;

  const tracks = JSON.parse(match[1]);
  console.log('track count', tracks.length);
  const track = tracks.find(t => t.languageCode === 'en' && !t.kind) || tracks.find(t => t.languageCode === 'en') || tracks[0];
  console.log('selected track', track && { languageCode: track.languageCode, kind: track.kind, baseUrl: String(track.baseUrl || '').slice(0, 200) });

  const timedtextUrl = track.baseUrl.replace(/\\u0026/g, '&');
  const res = await fetch(timedtextUrl, {
    headers: {
      'User-Agent': headers['User-Agent'],
      'Accept-Language': headers['Accept-Language'],
      'Referer': headers['Referer'],
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': '2.20260907.06.00',
      'Accept': '*/*',
      'Cookie': cookie
    },
    signal: AbortSignal.timeout(30000)
  });
  console.log('timedtext status', res.status, res.statusText, 'content-type', res.headers.get('content-type'));
  const body = await res.text();
  console.log('body sample', body.slice(0, 500));
  console.log('has transcript?', /<text|"events"|WEBVTT/.test(body));
})();
