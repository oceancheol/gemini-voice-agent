'use strict';
require('dotenv').config();
const https = require('https');

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=100`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const live = json.models?.filter(m =>
      m.name.includes('live') || m.name.includes('flash-live') ||
      m.supportedGenerationMethods?.includes('bidiGenerateContent')
    );
    console.log('=== Live API 지원 모델 ===');
    live?.forEach(m => console.log(m.name, '|', m.supportedGenerationMethods?.join(', ')));
    console.log('\n=== 전체 flash 모델 ===');
    json.models?.filter(m => m.name.includes('flash')).forEach(m =>
      console.log(m.name, '|', m.supportedGenerationMethods?.join(', '))
    );
  });
}).on('error', console.error);
