// 치지직 채널의 팔로워(후궁) 수를 받아 followers.json 에 기록한다.
// content.json 의 followers.auto 가 true 이고 channelId 가 있을 때만 동작한다.
// 숫자가 바뀌었을 때만 파일을 다시 쓰므로, 변화가 없으면 커밋도 생기지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

async function main() {
  const content = JSON.parse(readFileSync('content.json', 'utf8'));
  const f = content.followers || {};
  const channelId = String(f.channelId || '').trim();

  if (!f.auto) return console.log('자동 연동이 꺼져 있어서 건너뜀');
  if (!/^[0-9a-f]{32}$/i.test(channelId)) return console.log('채널 ID가 없거나 형식이 달라서 건너뜀:', channelId);

  const res = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (rekhee-followers-bot)' }
  });
  if (!res.ok) throw new Error('치지직 API 오류 ' + res.status);
  const body = await res.json();
  const count = body?.content?.followerCount;
  if (typeof count !== 'number' || !body.content.channelId) {
    throw new Error('팔로워 수를 찾지 못함. 채널 ID를 확인하세요. ' + JSON.stringify(body).slice(0, 200));
  }

  const prev = existsSync('followers.json') ? JSON.parse(readFileSync('followers.json', 'utf8')) : null;
  if (prev && prev.count === count && prev.channelId === channelId) return console.log(`변화 없음: ${count}명`);

  const out = { count, channelId, channelName: body.content.channelName, updatedAt: new Date().toISOString() };
  writeFileSync('followers.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`갱신: ${prev ? prev.count : '-'} → ${count}명`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
