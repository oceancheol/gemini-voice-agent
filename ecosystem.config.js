module.exports = {
  apps: [{
    name: 'gemini-voice-agent',
    script: 'server.js',
    cwd: '/Users/seungcheol/gemini-voice-agent',
    watch: false,
    env: {
      NODE_ENV: 'production',
    },
    // 재시작 정책
    restart_delay: 3000,
    max_restarts: 10,
    // 로그
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
