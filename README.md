# TOEFL Prep Web (Cloudflare R2/Worker 버전)

이 버전은 **프런트는 GitHub Pages(정적)**, **문제/오디오는 Cloudflare R2 + Worker(API)** 로 가져오는 구조야.

- 프런트: `toefl-web/` 를 GitHub Pages로 배포
- 데이터: R2 버킷에 업로드
- Worker: `/api/*` 및 `/data/*` 라우트로 동작 (직접 접근 차단 + 세션 쿠키)

## 1) 로컬 테스트(선택)
Worker까지 같이 테스트하려면:

```bash
cd worker
npm i
wrangler secret put SESSION_SECRET
wrangler dev --remote
```

그 다음 프런트:

```bash
cd ../toefl-web
python -m http.server 8000
```

브라우저:
- http://localhost:8000

> 로컬에서는 `TOEFL_FORCE_API_MODE=true` 로 강제 API 모드도 가능.

## 2) R2 업로드 구조(중요)

R2 버킷 안에 아래처럼 올려줘:

```
reading/TOEFL_Reading_0001.txt
reading/TOEFL_Reading_0002.txt
...

listening/<네 리스닝팩 루트>/Listening_Set_001/metadata.json
listening/<네 리스닝팩 루트>/Listening_Set_001/questions.txt
listening/<네 리스닝팩 루트>/Listening_Set_001/answer_key.txt
listening/<네 리스닝팩 루트>/Listening_Set_001/listening.mp3
listening/<네 리스닝팩 루트>/Listening_Set_001/questions_q01.mp3
...
```

※ Worker가 `reading/_index.json`, `listening/_index.json` 가 있으면 그걸 우선 사용하고,
없으면 자동으로 스캔해서 인덱스를 만들어줘.

## 3) 프런트 배포
`toefl-web/` 폴더 내용을 GitHub Pages로 배포해.

## 4) Worker 배포
`worker/README.md` 참고.
