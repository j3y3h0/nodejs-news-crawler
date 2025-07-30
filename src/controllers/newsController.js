/**
 * @fileoverview 뉴스 관련 API 컨트롤러
 * @description 뉴스 조회, 크롤링 실행, 로그 조회 등의 API 요청을 처리합니다.
 */

/**
 * 뉴스 컨트롤러 클래스
 * @class NewsController
 */
class NewsController {
  /**
   * NewsController 생성자
   * @param {Object} newsService - 뉴스 서비스 인스턴스
   * @param {Object} newsCrawler - 뉴스 크롤러 인스턴스
   */
  constructor(newsService, newsCrawler) {
    this.newsService = newsService;
    this.newsCrawler = newsCrawler;
  }

  /**
   * API 기본 정보 조회
   * @async
   * @function getApiInfo
   * @param {Object} req - Express 요청 객체
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description API의 기본 정보와 사용 가능한 엔드포인트 목록을 반환합니다.
   */
  async getApiInfo(req, res) {
    try {
      res.json({
        message: '네이버 뉴스 크롤러 API',
        version: '1.0.0',
        description:
          '네이버 뉴스를 크롤링하여 데이터베이스에 저장하고 조회할 수 있는 API입니다.',
        endpoints: {
          health: {
            path: '/health',
            method: 'GET',
            description: '서버 상태 확인',
          },
          news: {
            path: '/api/news',
            method: 'GET',
            description: '뉴스 목록 조회',
            parameters: {
              page: '페이지 번호 (기본값: 1)',
              limit: '페이지당 항목 수 (기본값: 20)',
              category: '카테고리 필터 (선택사항)',
            },
          },
          crawl: {
            path: '/api/crawl',
            method: 'POST',
            description: '수동 크롤링 실행',
          },
          crawlLogs: {
            path: '/api/crawl/logs',
            method: 'GET',
            description: '크롤링 로그 조회',
          },
          stats: {
            path: '/api/stats',
            method: 'GET',
            description: '뉴스 통계 조회',
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('API 정보 조회 에러:', error);
      res.status(500).json({
        error: 'API 정보를 가져오는 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 서버 헬스체크
   * @async
   * @function getHealthCheck
   * @param {Object} req - Express 요청 객체
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 서버의 상태와 데이터베이스 연결 상태를 확인합니다.
   */
  async getHealthCheck(req, res) {
    try {
      // 데이터베이스 연결 상태 확인
      const dbStatus = await this.checkDatabaseConnection();

      res.json({
        status: 'OK',
        database: dbStatus ? 'Connected' : 'Disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    } catch (error) {
      console.error('헬스체크 에러:', error);
      res.status(500).json({
        status: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 뉴스 목록 조회
   * @async
   * @function getNews
   * @param {Object} req - Express 요청 객체
   * @param {Object} req.query - 쿼리 파라미터
   * @param {number} [req.query.page=1] - 페이지 번호
   * @param {number} [req.query.limit=20] - 페이지당 항목 수
   * @param {string} [req.query.category] - 카테고리 필터
   * @param {string} [req.query.startDate] - 시작 날짜 필터
   * @param {string} [req.query.endDate] - 종료 날짜 필터
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 저장된 뉴스 목록을 페이징과 필터링 옵션과 함께 조회합니다.
   */
  async getNews(req, res) {
    try {
      const { page = 1, limit = 20, category, startDate, endDate } = req.query;

      // 파라미터 유효성 검사
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({
          error: '페이지 번호는 1 이상의 숫자여야 합니다.',
          timestamp: new Date().toISOString(),
        });
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          error: '페이지당 항목 수는 1-100 사이의 숫자여야 합니다.',
          timestamp: new Date().toISOString(),
        });
      }

      const news = await this.newsService.getNews({
        page: pageNum,
        limit: limitNum,
        category,
        startDate,
        endDate,
      });

      res.json({
        success: true,
        ...news,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('뉴스 조회 에러:', error);
      res.status(500).json({
        error: '뉴스를 가져오는 중 오류가 발생했습니다.',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 뉴스 상세 조회
   * @async
   * @function getNewsDetail
   * @param {Object} req - Express 요청 객체
   * @param {Object} req.params - URL 파라미터
   * @param {string} req.params.id - 뉴스 ID
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 특정 뉴스의 상세 정보를 조회합니다.
   */
  async getNewsDetail(req, res) {
    try {
      const { id } = req.params;
      const newsId = parseInt(id);

      if (isNaN(newsId) || newsId < 1) {
        return res.status(400).json({
          error: '유효한 뉴스 ID를 입력해주세요.',
          timestamp: new Date().toISOString(),
        });
      }

      const news = await this.newsService.getNewsDetail(newsId);

      res.json({
        success: true,
        data: news,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('뉴스 상세 조회 에러:', error);

      if (error.message.includes('찾을 수 없습니다')) {
        res.status(404).json({
          error: '해당 뉴스를 찾을 수 없습니다.',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(500).json({
          error: '뉴스 상세 정보를 가져오는 중 오류가 발생했습니다.',
          details: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * 수동 크롤링 실행
   * @async
   * @function executeCrawling
   * @param {Object} req - Express 요청 객체
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 네이버 뉴스 크롤링을 수동으로 실행합니다.
   */
  async executeCrawling(req, res) {
    try {
      console.log('🚀 수동 크롤링 실행 요청:', new Date().toISOString());

      const result = await this.newsCrawler.crawlNews();

      res.json({
        success: true,
        message: '크롤링이 성공적으로 완료되었습니다.',
        result: {
          itemCount: result.itemCount,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('❌ 크롤링 실행 에러:', error);
      res.status(500).json({
        success: false,
        error: '크롤링 실행 중 오류가 발생했습니다.',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 크롤링 로그 조회
   * @async
   * @function getCrawlLogs
   * @param {Object} req - Express 요청 객체
   * @param {Object} req.query - 쿼리 파라미터
   * @param {number} [req.query.limit=50] - 조회할 로그 수
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 크롤링 작업의 이력과 상태를 조회합니다.
   */
  async getCrawlLogs(req, res) {
    try {
      const { limit = 50 } = req.query;
      const limitNum = parseInt(limit);

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
        return res.status(400).json({
          error: '조회할 로그 수는 1-200 사이의 숫자여야 합니다.',
          timestamp: new Date().toISOString(),
        });
      }

      const logs = await this.newsService.getCrawlLogs(limitNum);

      res.json({
        success: true,
        data: logs,
        count: logs.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('크롤링 로그 조회 에러:', error);
      res.status(500).json({
        error: '크롤링 로그를 가져오는 중 오류가 발생했습니다.',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 뉴스 통계 조회
   * @async
   * @function getNewsStats
   * @param {Object} req - Express 요청 객체
   * @param {Object} res - Express 응답 객체
   * @returns {Promise<void>}
   * @description 뉴스 데이터베이스의 통계 정보를 조회합니다.
   */
  async getNewsStats(req, res) {
    try {
      const stats = await this.newsService.getNewsStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('뉴스 통계 조회 에러:', error);
      res.status(500).json({
        error: '뉴스 통계를 가져오는 중 오류가 발생했습니다.',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 데이터베이스 연결 상태 확인
   * @async
   * @function checkDatabaseConnection
   * @returns {Promise<boolean>}
   * @private
   * @description 데이터베이스 연결 상태를 확인합니다.
   */
  async checkDatabaseConnection() {
    try {
      // 간단한 쿼리로 데이터베이스 연결 상태 확인
      await this.newsService.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('데이터베이스 연결 확인 에러:', error);
      return false;
    }
  }
}

module.exports = NewsController;
