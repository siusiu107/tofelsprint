# TOEFL Prep Web (최종 v5)

이 zip에는 **웹앱 코드만** 들어있어. (Reading/Listening 데이터는 포함 안 함)

---

## 1) 실행 방법
압축 풀고 `(프로젝트 루트)/` 폴더에서:

```bash
python -m http.server 8000
```

브라우저:
- http://localhost:8000

> `file://` 더블클릭 실행은 브라우저가 fetch를 막아서 오류날 수 있어.

---

## 2) 데이터 넣는 위치

### Reading
`data/reading/` 에 **TOFEL기출-reading.zip 압축 해제**

- txt가 1~2단계 폴더 안에 있어도 자동으로 찾아.

### Listening
`data/listening/` 에 **TOFEL기출-listening.zip 압축 해제**

- `Listening_Set_001/metadata.json`, `listening.mp3`, `questions_q01.mp3...` 같은 구조면 자동 인식.

---

## 3) 디자인(스크린샷 느낌)
- 전체 하얀 배경
- 상단 보라색 Topbar + 연두 프레임 카드 UI
- 라운드(18px) + 소프트 쉐도우
- Listening은 상단에 진행바/남은시간 표시

---

## 4) 기능 요약

### 연습모드(Practice)
- 답 선택 자유
- 이동은 **수동(Prev/Next)**
- 연습모드 기록/답안은 **localStorage에 저장 안 함**(탭 닫으면 초기화)

### 실전모드(Simulation Test)
- 시작 전: **세션 설명 → 3초 ‘시험 준비중’** → 시작
- 팝업으로 열림
- 시간 조정 불가(고정)
- 종료 후: **채점 결과 + 리뷰(문항별 정오/내답)**

### Listening 규칙
- 오디오 재생 중에는 문제 화면 숨김
- main audio 끝 → question audio
- **SimTest**: question audio 끝나면 **답 선택 여부 상관없이 자동 다음**
- **lecture + conversation 섞어서 출제**

---

## 5) 보안/제한(최대한)
- 오디오: 시킹/배속 변경/SimTest 임의 일시정지 등 조작을 최대한 차단
- 직접 URL로 `/data/reading/` `/data/listening/` 접근 시 **“잘못된 접근입니다”** 표시 (서비스워커 설치 후)
- **SimTest에서 Shift+F5/Ctrl+R 등 새로고침을 살짝 차단**(키 입력 차단 + 나가기 경고)

※ 웹 특성상 개발자도구/네트워크 레벨까지 100% 완전 차단은 불가능해.

---

# Cloudflare Pages + Functions 배포 (권장)

이 프로젝트는 **/data/** 경로에 주소창으로 직접 접근하려고 하면(새로고침/Shift+F5 포함) “잘못된 접근입니다”를 띄우도록 **Pages Functions**가 설정되어 있어.
- `/functions/data/[[path]].ts` : /data/* 문서 네비게이션 차단
- `/_routes.json` : /data/* 요청만 함수에 태움

## 1) GitHub에 업로드 (필수)
Cloudflare Pages에서 Functions를 쓰려면 **Git 연결 배포**가 제일 안정적이야.

1. GitHub에서 새 저장소 만들기 (예: `toefl-prep-web`)
2. 이 zip 압축을 풀고, **site 폴더 안의 내용물을 저장소 루트에 그대로** 올려
   - 루트에 `index.html`, `functions/`, `_routes.json` 가 보여야 함

## 2) Cloudflare Pages 프로젝트 만들기
1. Cloudflare 대시보드 → **Workers & Pages**
2. **Create application** → **Pages** → **Connect to Git**
3. GitHub 로그인/권한 허용 → 방금 만든 repo 선택
4. 설정:
   - Framework preset: **None**
   - Build command: *(비움)*
   - Build output directory: **/** (또는 비움/기본)
5. **Save and Deploy**

배포가 끝나면 `https://<project>.pages.dev` 주소가 생김.

## 3) 커스텀 도메인 연결(이미 추가했으면 확인만)
1. Pages 프로젝트 → **Custom domains**
2. 도메인 추가 → 안내대로 DNS 레코드 자동 생성/확인
3. `www`도 쓰면 리다이렉트 설정(선택)

## 4) 데이터 넣는 위치
- Reading: `data/reading/` 아래에 txt 파일들(또는 하위 폴더) 압축해제
- Listening: `data/listening/` 아래에 세트 폴더들 압축해제

> ⚠️ Cloudflare Pages는 **파일 1개당 최대 25MiB**, **Free 플랜은 사이트 파일 총 20,000개** 제한이 있어.
> 오디오/파일 개수가 너무 많으면 제한에 걸릴 수 있음(그땐 R2로 옮기는 게 정답).
