# 네이버 뉴스 크롤러

네이버 뉴스 메인 페이지에서 뉴스를 크롤링하여 MySQL 데이터베이스에 저장하는 Node.js 애플리케이션입니다.

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

## 데이터베이스 구조

### 메인 뉴스 테이블 (main_news)

- `id`: 기본키
- `title`: 뉴스 제목
- `url`: 뉴스 URL (고유)
- `imageUrl`: 썸네일 이미지 URL
- `summary`: 뉴스 요약
- `category`: 뉴스 카테고리
- `publishedAt`: 발행 시간
- `crawledAt`: 크롤링 시간

### 뉴스 상세 테이블 (news_detail)

- `id`: 기본키
- `mainNewsId`: 메인 뉴스 외래키
- `content`: 뉴스 본문
- `author`: 기자명
- `source`: 언론사
- `tags`: 태그
- `viewCount`: 조회수
- `likeCount`: 좋아요 수
- `commentCount`: 댓글 수

### 크롤링 로그 테이블 (crawl_log)

- `id`: 기본키
- `status`: 크롤링 상태
- `message`: 메시지
- `itemCount`: 처리된 아이템 수
- `duration`: 소요 시간

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

`.env` 파일을 수정하여 데이터베이스 연결 정보를 입력하세요:

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
# Prisma 클라이언트 생성
npm run db:generate

# 데이터베이스 마이그레이션
npm run db:migrate
```

### 5. 애플리케이션 실행

```bash
# 개발 모드 (nodemon 사용)
npm run dev

# 프로덕션 모드
npm start
```

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

애플리케이션은 환경 변수 `CRAWL_INTERVAL_HOURS`에 설정된 간격으로 자동 크롤링을 실행합니다.

- 기본값: 1시간마다
- 크론 표현식: `0 */1 * * *`

## 개발 정보

### 프로젝트 구조

```
├── src/
│   ├── crawler/
│   │   └── newsCrawler.js     # 뉴스 크롤링 로직
│   └── services/
│       └── newsService.js     # 데이터베이스 서비스
├── prisma/
│   └── schema.prisma          # 데이터베이스 스키마
├── index.js                   # 메인 애플리케이션 파일
├── package.json
├── .env                       # 환경 변수
└── README.md
```

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

1. **데이터베이스 설정**: MySQL 데이터베이스가 실행 중이어야 합니다.
2. **환경 변수**: `.env` 파일에 올바른 데이터베이스 연결 정보를 입력해야 합니다.
3. **크롤링 정책**: 네이버의 robots.txt와 이용약관을 준수해야 합니다.
4. **요청 제한**: 과도한 요청으로 인한 IP 차단을 방지하기 위해 적절한 딜레이를 설정하세요.

## 라이선스

ISC License

## 기여하기

1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request
