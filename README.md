# 나무뉴스 크롤러 (namu.news)

namu.news 사이트의 여러 카테고리(IT/과학, 세계, 문화, 사회, 경제, 정치, 시사일반)를 크롤링하여 MySQL 데이터베이스에 저장하고 REST API로 제공합니다. 기존 네이버 전용 크롤러 구조를 OOP(템플릿/전략) 형태로 리팩토링하여 다른 소스 추가가 용이합니다.

## 주요 기능

- 🕐 **자동 스케줄링**: Node Schedule을 사용하여 매시간 자동 크롤링
- 📊 **데이터베이스 저장**: Prisma ORM을 통한 MySQL 데이터 관리
- 🚀 **REST API**: Express.js 기반 뉴스 조회 API
- 💾 **캐싱**: Node Cache를 활용한 성능 최적화
- 📝 **로깅**: 크롤링 작업 이력 추적

## 기술 스택

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL
- **ORM**: Prisma
- **HTTP Client**: Axios
- **Scheduling**: Node Schedule
- **Caching**: Node Cache
- **Development**: Nodemon, Prettier

## 데이터베이스 구조 (snake_case, FK 제거)

실제 Prisma 모델명과 컬럼 (요약):

### news_main

- `news_se` (PK)
- `title_ct` (제목)
- `url_lk` (원문 링크, Unique)
- `image_url_ct` (이미지 URL)
- `summary_ct`
- `category_nm`
- `published_dt`
- `crawled_dt`

### news_detail

- `detail_se` (PK)
- `news_se` (메인 참조용 값 - FK 미구현)
- `content_ct`
- `author_nm`
- `source_nm`
- `tags_ct`
- `view_count_nb`
- `like_count_nb`
- `comment_count_nb`
- `crawled_dt`

### news_crawl_log

- `crawl_log_se` (PK)
- `status_cd` (started|success|error)
- `message_ct`
- `item_count_nb`
- `duration_ms_nb`
- `started_dt`
- `finished_dt`

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone <repository-url>
cd nodejs-news-crawler
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env` 파일을 수정하여 데이터베이스 연결 정보를 입력

```env
DATABASE_URL="mysql://username:password@localhost:3306/news_crawler"
NODE_ENV=development
PORT=3000
CRAWL_INTERVAL_HOURS=1
CRAWL_TIMEOUT_MS=30000
MAX_CONCURRENT_REQUESTS=5
CACHE_TTL_SECONDS=3600
```

### 4. 데이터베이스 설정

```bash
npx prisma init

# DB 동기화 명령어들
npx prisma db push
npx prisma db pull
npx prisma generate

npx prisma migrate dev --name migration
```

````

### 5. 애플리케이션 실행

```bash
# 개발 모드 (nodemon 사용)
npm run dev

# 프로덕션 모드
npm start
````

## API 엔드포인트

### 기본 정보

- `GET /` - API 정보 및 엔드포인트 목록
- `GET /health` - 헬스체크

### 뉴스 관련

- `GET /api/news` - 뉴스 목록 조회
  - Query Parameters:
    - `page`: 페이지 번호 (기본값: 1)
    - `limit`: 페이지당 항목 수 (기본값: 20)
    - `category`: 카테고리 필터

### 크롤링 관련

- `POST /api/crawl` - 수동 크롤링 실행
- `GET /api/crawl/logs` - 크롤링 로그 조회

## 스케줄링 설정

애플리케이션은 환경 변수 `CRAWL_INTERVAL_HOURS`에 설정된 간격으로 자동 크롤링을 실

- 기본값: 1시간마다
- 크론 표현식: `0 */1 * * *`

## 개발 정보

### 프로젝트 구조 (발췌)

```
├── src/
│   ├── crawler/
│   │   ├── BaseCrawler.js        # 공통 추상 크롤러 (템플릿 메서드)
│   │   ├── NamuNewsCrawler.js    # namu.news 구현체 (현재 사용)
│   │   └── newsCrawler.js        # (구) Naver 전용 - 미사용, 참고용
│   ├── controllers/
│   │   └── newsController.js
│   ├── routes/
│   │   ├── baseRoutes.js
│   │   └── newsRoutes.js
│   └── services/
│       └── newsService.js
├── prisma/
│   └── schema.prisma
├── index.js
└── README.md
```

### OOP 구조 개요

1. `BaseCrawler` : 공통 로직 (필터링, 상세 저장, 캐시, 지연) 제공
2. `NamuNewsCrawler` : 카테고리 URL / 선택자 / 파싱 로직 구현
3. 추후 다른 소스(예: Naver, RSS 등) 추가 시 `BaseCrawler` 상속 신규 클래스만 작성

### 메서드 흐름

`crawlNews()` → 카테고리 순회 → `crawlCategoryNews()`로 기사 리스트 확보 → 신규 URL 필터 → 저장 → 비동기 `crawlAndSaveDetailNews()`가 `crawlNewsDetail()` 호출하여 상세 저장.

### 주요 패키지 명령어

```bash
npm run dev          # 개발 서버 시작 (nodemon)
npm start            # 프로덕션 서버 시작
npm run db:generate  # Prisma 클라이언트 생성
npm run db:migrate   # 데이터베이스 마이그레이션
npm run db:reset     # 데이터베이스 리셋
npm run db:studio    # Prisma Studio 실행
```

## 주의사항

1. **데이터베이스 설정**: MySQL 데이터베이스 필요
2. **환경 변수**: `.env` 파일에 올바른 데이터베이스 연결 정보를 입력
3. **크롤링 정책**: 대상 사이트(namu.news)의 robots.txt / 이용약관 확인 후 사용
4. **요청 제한**: 카테고리 순회 간 `delay`(기본 800ms) 삽입; 필요 시 환경 변수화 권장
5. **확장성**: 새 소스 추가 시 `BaseCrawler` 상속 클래스로 최소 수정 반경 유지

## 향후 개선 아이디어

- 태그/카테고리 테이블 활용 및 매핑 저장 로직 활성화
- 중복 기사 유사도(제목 유사도) 검사
- 상세 페이지 실패 재시도 큐
- OpenSearch/Elastic 연동으로 검색 API 추가
- Jest 기반 단위/통합 테스트 추가
