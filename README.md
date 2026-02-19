# TOEFL Prep Web (Clean URL)

여기에는 **웹앱 코드만** 들어있어. (Reading/Listening 데이터는 포함 안 함)

---

## 1) 실행 방법

```bash
```

브라우저:
- http://localhost:8000

> `file://` 더블클릭 실행은 브라우저가 fetch를 막아서 오류날 수 있어.

---

## 2) 주소에 # 없애기 (Clean URL)
이 버전은 `#/practice/...`가 아니라 **`/practice/...`** 형태로 동작해.

Cloudflare Pages에서 clean URL이 새로고침/직접접속에도 동작하려면, 루트에 있는 `_redirects` 이 한 줄이 꼭 필요해:

```
/* /index.html 200
```

이미 이 프로젝트에 포함돼 있어.

> 참고: 앱을 도메인 루트(/)가 아니라 하위 경로(예: /toefl/)에 올리면
> `index.html`의 `<base href="/">` 와 `window.APP_BASE` 값을 그 경로로 바꿔야 해.

---

## 3) 데이터 넣는 위치

### Reading
`data/reading/` 에 **리딩 txt 파일들** 넣기
- txt가 1~2단계 폴더 안에 있어도 자동으로 찾아.

예) `data/reading/TOEFL_Reading_0002.txt`

### Listening
`data/listening/` 에 **리스닝 세트 폴더들** 넣기

예)
- `data/listening/Listening_Set_001/answer_key.txt`
- `data/listening/Listening_Set_001/questions.txt`
- `data/listening/Listening_Set_001/metadata.json`

---

## 4) Cloudflare Pages 배포
- Framework preset: **None**
- Build command: 없음 (또는 `exit 0`)
- Output directory: `/` (또는 비움)

배포가 끝나면 커스텀 도메인 연결만 하면 됨.

---

## 5) 보안(최대한)
- `/data/reading/*`, `/data/listening/*` 를 주소창으로 직접 열면 **"잘못된 접근입니다"** (Service Worker)
- Simulation에서 새로고침 키를 최대한 막음

※ 웹 특성상 개발자도구/네트워크 레벨까지 100% 완전 차단은 불가능해.