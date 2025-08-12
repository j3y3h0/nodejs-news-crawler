/**
 * @fileoverview 뉴스 데이터베이스 서비스 클래스
 * @description Prisma ORM을 사용하여 뉴스 데이터의 CRUD 작업을 처리합니다.
 */

/**
 * 뉴스 서비스 클래스
 * @class NewsService
 * @description 뉴스 데이터베이스 작업을 처리하는 서비스 클래스입니다.
 */
class NewsService {
  /**
   * NewsService 생성자
   * @constructor
   * @param {Object} prisma - Prisma 클라이언트 인스턴스
   * @description Prisma 클라이언트를 초기화합니다.
   */
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * 메인 뉴스 저장
   */
  async saveMainNews(newsData) {
    try {
      const { getCurrentIsoTime } = require('../utils/commonUtils');
      const news = await this.prisma.news_main.create({
        data: {
          title_ct: newsData.title,
          url_lk: newsData.url,
          image_lk: newsData.imageUrl,
          summary_ct: newsData.summary,
          category_nm: newsData.category,
          published_dt: newsData.publishedAt || getCurrentIsoTime(),
          crawled_dt: getCurrentIsoTime(),
          updated_dt: getCurrentIsoTime(),
        },
      });

      console.log(`메인 뉴스 저장 완료: ${news.title_ct}`);
      return news;
    } catch (error) {
      if (error.code === 'P2002') {
        // 중복 URL 에러 무시
        console.log(`중복 뉴스 스킵: ${newsData.url}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * 뉴스 상세 내용 저장
   */
  async saveNewsDetail(mainNewsId, detailData) {
    try {
      const { getCurrentIsoTime } = require('../utils/commonUtils');
      const detail = await this.prisma.news_detail.create({
        data: {
          news_se: mainNewsId,
          content_ct: detailData.content,
          author_nm: detailData.author,
          source_nm: detailData.source,
          tags_ct: detailData.tags,
          view_va: detailData.viewCount || 0,
          like_va: detailData.likeCount || 0,
          comment_va: detailData.commentCount || 0,
          reg_dt: getCurrentIsoTime(),
          updated_dt: getCurrentIsoTime(),
        },
      });

      console.log(`뉴스 상세 저장 완료: ID ${mainNewsId}`);
      return detail;
    } catch (error) {
      // 동시성(실시간 상세 크롤 + 백필)으로 인한 중복 생성 시도 처리
      if (error.code === 'P2002') {
        console.log(`뉴스 상세 중복 스킵: news_se=${mainNewsId}`);
        // 이미 존재하는 상세를 반환 (필요 시 null 로 단순 무시 가능)
        try {
          return await this.prisma.news_detail.findUnique({
            where: { news_se: mainNewsId },
          });
        } catch (_) {
          return null;
        }
      }
      console.error('뉴스 상세 저장 에러:', error);
      throw error;
    }
  }

  /**
   * 뉴스 목록 조회
   */
  async getNews(options = {}) {
    const { page = 1, limit = 20, category, startDate, endDate } = options;

    const skip = (page - 1) * limit;

    try {
      const where = {};

      if (category) {
        where.category_nm = category;
      }

      if (startDate || endDate) {
        where.published_dt = {};
        if (startDate) where.published_dt.gte = new Date(startDate);
        if (endDate) where.published_dt.lte = new Date(endDate);
      }

      const [news, total] = await Promise.all([
        this.prisma.news_main.findMany({
          where,
          include: {
            news_detail: {
              select: {
                author_nm: true,
                source_nm: true,
                view_va: true,
                like_va: true,
                comment_va: true,
              },
            },
          },
          orderBy: {
            published_dt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.news_main.count({ where }),
      ]);

      return {
        data: news,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('뉴스 조회 에러:', error);
      throw error;
    }
  }

  /**
   * 뉴스 상세 조회
   */
  async getNewsDetail(id) {
    try {
      const news = await this.prisma.news_main.findUnique({
        where: { news_se: parseInt(id) },
        include: {
          news_detail: true,
        },
      });

      if (!news) {
        throw new Error('뉴스를 찾을 수 없습니다.');
      }

      return news;
    } catch (error) {
      console.error('뉴스 상세 조회 에러:', error);
      throw error;
    }
  }

  /**
   * 기존 URL 목록 조회 (중복 체크용)
   */
  async getExistingUrls(urls) {
    try {
      const existingNews = await this.prisma.news_main.findMany({
        where: {
          url_lk: {
            in: urls,
          },
        },
        select: {
          url_lk: true,
        },
      });

      return existingNews.map(news => news.url_lk);
    } catch (error) {
      console.error('기존 URL 조회 에러:', error);
      return [];
    }
  }

  /**
   * 크롤링 로그 생성
   */
  async createCrawlLog(status = 'started', message = null) {
    try {
      const log = await this.prisma.news_crawl_log.create({
        data: {
          status_cd: status,
          message_ct: message,
        },
      });

      return log.crawl_log_se;
    } catch (error) {
      console.error('크롤링 로그 생성 에러:', error);
      throw error;
    }
  }

  /**
   * 크롤링 로그 업데이트
   */
  async updateCrawlLog(logId, status, message = null, itemCount = null) {
    try {
      const endedAt = new Date();
      const log = await this.prisma.news_crawl_log.findUnique({
        where: { crawl_log_se: logId },
      });

      const duration = log ? endedAt.getTime() - log.start_dt.getTime() : null;

      await this.prisma.news_crawl_log.update({
        where: { crawl_log_se: logId },
        data: {
          status_cd: status,
          message_ct: message,
          item_va: itemCount,
          end_dt: endedAt,
          duration_va: duration,
        },
      });
    } catch (error) {
      console.error('크롤링 로그 업데이트 에러:', error);
    }
  }

  /**
   * 크롤링 로그 조회
   */
  async getCrawlLogs(limit = 50) {
    try {
      const logs = await this.prisma.news_crawl_log.findMany({
        orderBy: {
          start_dt: 'desc',
        },
        take: limit,
      });

      return logs;
    } catch (error) {
      console.error('크롤링 로그 조회 에러:', error);
      throw error;
    }
  }

  /**
   * 뉴스 통계 조회
   */
  async getNewsStats() {
    try {
      const [totalNews, todayNews, categoryStats, recentCrawls] =
        await Promise.all([
          // 전체 뉴스 수
          this.prisma.news_main.count(),

          // 오늘 크롤링된 뉴스 수
          this.prisma.news_main.count({
            where: {
              crawled_dt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),

          // 카테고리별 통계
          this.prisma.news_main.groupBy({
            by: ['category_nm'],
            _count: {
              news_se: true,
            },
          }),

          // 최근 크롤링 상태
          this.prisma.news_crawl_log.findMany({
            orderBy: {
              start_dt: 'desc',
            },
            take: 5,
          }),
        ]);

      return {
        totalNews,
        todayNews,
        categoryStats,
        recentCrawls,
      };
    } catch (error) {
      console.error('뉴스 통계 조회 에러:', error);
      throw error;
    }
  }

  /**
   * 오래된 뉴스 삭제 (데이터 정리용)
   */
  async cleanupOldNews(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.prisma.news_main.deleteMany({
        where: {
          crawled_dt: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`${result.count}개의 오래된 뉴스를 삭제했습니다.`);
      return result.count;
    } catch (error) {
      console.error('오래된 뉴스 삭제 에러:', error);
      throw error;
    }
  }

  /**
   * 상세 미존재 메인 뉴스 조회 (url_lk 기반 상세 크롤링 대상)
   * @param {number} limit - 최대 조회 수
   * @returns {Promise<Array>} news_main 레코드 배열
   */
  async getMainNewsWithoutDetail(limit = 20) {
    try {
      // 효율적 조회를 위해 LEFT JOIN 사용 (raw query)
      const rows = await this.prisma.$queryRaw`
        SELECT m.* FROM news_main m
        LEFT JOIN news_detail d ON m.news_se = d.news_se
        WHERE d.news_se IS NULL
        ORDER BY m.published_dt DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch (error) {
      console.error('상세 미존재 메인 뉴스 조회 에러:', error);
      return [];
    }
  }
}

module.exports = NewsService;
