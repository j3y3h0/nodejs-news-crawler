/**
 * @fileoverview 네이버 뉴스 크롤러 메인 애플리케이션
 * @description 네이버 뉴스를 크롤링하여 MySQL 데이터베이스에 저장하고 REST API를 제공하는 Node.js 애플리케이션
 * @version 1.0.0
 * @author News Crawler Team
 */

const express = require('express');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// 서비스 및 크롤러 모듈
const NewsCrawler = require('./src/crawler/newsCrawler');
const NewsService = require('./src/services/newsService');

// 컨트롤러 및 라우터 모듈
const NewsController = require('./src/controllers/newsController');
const createNewsRouter = require('./src/routes/newsRoutes');
const createBaseRouter = require('./src/routes/baseRoutes');

// 환경 변수 로드
dotenv.config();

/**
 * Express 애플리케이션 설정
 * @type {Object}
 */
const app = express();

/**
 * 서버 포트 번호
 * @type {number}
 */
const port = process.env.PORT || 3000;

/**
 * Prisma 클라이언트 인스턴스
 * @type {PrismaClient}
 */
const prisma = new PrismaClient();

/**
 * 뉴스 서비스 인스턴스
 * @type {NewsService}
 */
const newsService = new NewsService(prisma);

/**
 * 뉴스 크롤러 인스턴스
 * @type {NewsCrawler}
 */
const newsCrawler = new NewsCrawler(newsService);

/**
 * 뉴스 컨트롤러 인스턴스
 * @type {NewsController}
 */
const newsController = new NewsController(newsService, newsCrawler);

/**
 * Express 미들웨어 설정
 */
// JSON 파싱 미들웨어
app.use(express.json());

// URL-encoded 파싱 미들웨어
app.use(express.urlencoded({ extended: true }));

/**
 * 라우터 설정
 */
// 기본 라우트 (/, /health)
app.use('/', createBaseRouter(newsController));

// API 라우트 (/api/news, /api/crawl 등)
app.use('/api', createNewsRouter(newsController));

/**
 * 크롤링 스케줄러 설정
 * @description Node Schedule을 사용하여 정기적으로 뉴스 크롤링을 실행합니다.
 */
const cronExpression = `0 */${process.env.CRAWL_INTERVAL_HOURS || 1} * * *`;
console.log(
  `⏰ 크롤링 스케줄 설정: ${cronExpression} (매 ${process.env.CRAWL_INTERVAL_HOURS || 1}시간)`
);

/**
 * 스케줄된 크롤링 작업
 * @function scheduledCrawling
 * @description 설정된 간격에 따라 자동으로 크롤링을 실행합니다.
 */
schedule.scheduleJob(cronExpression, async () => {
  const timestamp = new Date().toISOString();
  console.log(`🕒 예약된 크롤링 시작: ${timestamp}`);

  try {
    const result = await newsCrawler.crawlNews();
    console.log(`✅ 예약된 크롤링 완료: ${result.itemCount}개 뉴스 처리`);
  } catch (error) {
    console.error('❌ 예약된 크롤링 에러:', error.message);
  }
});

/**
 * 서버 시작 함수
 * @async
 * @function startServer
 * @returns {Promise<void>}
 * @description 데이터베이스 연결을 확인하고 Express 서버를 시작합니다.
 */
async function startServer() {
  try {
    // 데이터베이스 연결 테스트
    await prisma.$connect();
    console.log('✅ 데이터베이스 연결 성공');

    // Express 서버 시작
    app.listen(port, () => {
      console.log(`🚀 서버가 포트 ${port}에서 실행 중입니다.`);
      console.log(`🌐 http://localhost:${port}`);
      console.log(`📊 헬스체크: http://localhost:${port}/health`);
      console.log(`📰 뉴스 API: http://localhost:${port}/api/news`);
      console.log(`🕷️ 크롤링 API: http://localhost:${port}/api/crawl`);
      console.log(`📈 통계 API: http://localhost:${port}/api/stats`);
    });

    // 애플리케이션 시작 시 초기 크롤링 실행 (비동기)
    console.log('🕷️ 초기 크롤링 시작...');
    newsCrawler
      .crawlNews()
      .then(result => {
        console.log(`✅ 초기 크롤링 완료: ${result.itemCount}개 뉴스 처리`);
      })
      .catch(error => {
        console.error('❌ 초기 크롤링 에러:', error.message);
      });
  } catch (error) {
    console.error('❌ 서버 시작 에러:', error);
    console.error(
      '💡 데이터베이스 연결을 확인해주세요. .env 파일의 DATABASE_URL을 확인하세요.'
    );
    process.exit(1);
  }
}

/**
 * Graceful shutdown 처리
 * @description 애플리케이션 종료 시 데이터베이스 연결을 정리합니다.
 */
process.on('SIGINT', async () => {
  console.log('\n🛑 애플리케이션 종료 요청 (SIGINT)...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 애플리케이션 종료 요청 (SIGTERM)...');
  await gracefulShutdown();
});

/**
 * 안전한 종료 처리 함수
 * @async
 * @function gracefulShutdown
 * @returns {Promise<void>}
 * @description 데이터베이스 연결을 안전하게 종료하고 프로세스를 종료합니다.
 */
async function gracefulShutdown() {
  try {
    console.log('🔌 데이터베이스 연결 종료 중...');
    await prisma.$disconnect();
    console.log('✅ 데이터베이스 연결 종료 완료');
    console.log('👋 애플리케이션이 안전하게 종료되었습니다.');
    process.exit(0);
  } catch (error) {
    console.error('❌ 종료 중 에러 발생:', error);
    process.exit(1);
  }
}

/**
 * 애플리케이션 시작
 */
startServer();

/**
 * Express 애플리케이션 내보내기 (테스트용)
 * @type {Object}
 */
module.exports = app;
