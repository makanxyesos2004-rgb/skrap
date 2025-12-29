/**
 * Система скоринга для ранжирования YouTube видео результатов
 * Основана на логике из Python скрипта youtube_music_finder.py
 */

interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  duration?: number;
  viewCount?: number;
  likeCount?: number;
}

interface ScoreBreakdown {
  titleMatch: number;
  keywords: number;
  channelTrust: number;
  views: number;
  likes: number;
  duration: number;
}

interface ScoredVideo extends VideoMetadata {
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export class VideoScorer {
  // Веса компонентов скоринга (сумма = 100)
  private readonly WEIGHT_TITLE_MATCH = 35;
  private readonly WEIGHT_OFFICIAL_KEYWORDS = 25;
  private readonly WEIGHT_CHANNEL_TRUST = 20;
  private readonly WEIGHT_VIEW_COUNT = 10;
  private readonly WEIGHT_LIKE_RATIO = 5;
  private readonly WEIGHT_DURATION = 5;

  // Пороговые значения
  private readonly MIN_TITLE_SIMILARITY = 50;
  private readonly MIN_TOTAL_SCORE = 30;
  private readonly OPTIMAL_DURATION_MIN = 120;  // 2 минуты
  private readonly OPTIMAL_DURATION_MAX = 420;  // 7 минут

  // Ключевые слова
  private readonly POSITIVE_KEYWORDS = [
    "official music video",
    "official video",
    "music video",
    "official mv",
    "official audio",
    "official",
    "m/v",
    "(mv)",
    "[mv]",
    "клип",
    "официальный клип",
    "официальное видео",
  ];

  private readonly NEGATIVE_KEYWORDS = [
    "cover", "кавер", "remix", "ремикс", "live", "лайв", "концерт", "concert",
    "acoustic", "акустика", "karaoke", "караоке", "instrumental", "инструментал",
    "reaction", "реакция", "tutorial", "урок", "lesson", "lyric video", "lyrics",
    "текст", "slowed", "reverb", "nightcore", "8d audio", "bass boosted",
    "sped up", "mashup",
  ];

  private readonly OFFICIAL_CHANNEL_INDICATORS = [
    "vevo", "official", "music", "records", "entertainment", "- topic",
  ];

  /**
   * Вычисляет схожесть двух строк (упрощенный алгоритм)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const normalize = (text: string): string => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    if (!norm1 || !norm2) return 0;

    // Проверяем точное совпадение
    if (norm1 === norm2) return 100;

    // Проверяем включение одной строки в другую
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = Math.min(norm1.length, norm2.length);
      const longer = Math.max(norm1.length, norm2.length);
      return Math.round((shorter / longer) * 100);
    }

    // Считаем общие слова
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));

    if (words1.size === 0 || words2.size === 0) return 0;

    const common = new Set([...words1].filter(x => words2.has(x)));
    const total = new Set([...words1, ...words2]);

    return Math.round((common.size / total.size) * 100);
  }

  /**
   * Оценивает совпадение названия с запросом
   */
  private calculateTitleScore(title: string, searchQuery: string): number {
    const baseSimilarity = this.calculateTextSimilarity(searchQuery, title);
    return Math.min(100, baseSimilarity);
  }

  /**
   * Оценивает наличие ключевых слов
   */
  private calculateKeywordsScore(title: string): number {
    const titleLower = title.toLowerCase();
    let score = 50; // Начальная нейтральная оценка

    // Положительные ключевые слова
    for (const keyword of this.POSITIVE_KEYWORDS) {
      if (titleLower.includes(keyword.toLowerCase())) {
        if (keyword.includes("official music video")) {
          score += 25;
        } else if (keyword.includes("official video")) {
          score += 20;
        } else if (keyword.includes("official")) {
          score += 15;
        } else {
          score += 10;
        }
      }
    }

    // Отрицательные ключевые слова
    for (const keyword of this.NEGATIVE_KEYWORDS) {
      if (titleLower.includes(keyword.toLowerCase())) {
        if (['cover', 'кавер', 'remix', 'ремикс'].includes(keyword.toLowerCase())) {
          score -= 40;
        } else {
          score -= 20;
        }
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Оценивает доверие к каналу
   */
  private calculateChannelScore(channelName: string, artistName: string): number {
    let score = 30;
    const channelLower = channelName.toLowerCase();

    // Проверяем индикаторы официальности
    for (const indicator of this.OFFICIAL_CHANNEL_INDICATORS) {
      if (channelLower.includes(indicator.toLowerCase())) {
        score += 15;
        break;
      }
    }

    // Проверяем совпадение с именем артиста
    if (artistName) {
      const similarity = this.calculateTextSimilarity(artistName, channelName);
      if (similarity > 80) {
        score += 25;
      } else if (similarity > 50) {
        score += 15;
      } else if (similarity > 30) {
        score += 5;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Оценивает популярность по просмотрам (логарифмическая шкала)
   */
  private calculateViewsScore(viewCount: number): number {
    if (viewCount <= 0) return 0;

    // Логарифмическая шкала: 1K = ~30, 1M = ~60, 100M = ~80, 1B = ~100
    const logViews = Math.log10(viewCount);
    const score = ((logViews - 3) / 7) * 100;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Оценивает соотношение лайков
   */
  private calculateLikesScore(likeCount: number, viewCount: number): number {
    if (viewCount <= 0 || likeCount <= 0) return 50;

    const likeRatio = (likeCount / viewCount) * 100;

    if (likeRatio < 1) return likeRatio * 30;
    if (likeRatio < 3) return 30 + (likeRatio - 1) * 10;
    if (likeRatio < 5) return 50 + (likeRatio - 3) * 10;
    if (likeRatio < 10) return 70 + (likeRatio - 5) * 4;
    return Math.min(100, 90 + (likeRatio - 10));
  }

  /**
   * Оценивает длительность
   */
  private calculateDurationScore(durationSeconds: number): number {
    if (durationSeconds <= 0) return 50;

    if (durationSeconds >= this.OPTIMAL_DURATION_MIN && 
        durationSeconds <= this.OPTIMAL_DURATION_MAX) {
      return 100;
    }

    if (durationSeconds < this.OPTIMAL_DURATION_MIN) {
      const ratio = durationSeconds / this.OPTIMAL_DURATION_MIN;
      return Math.max(0, ratio * 100);
    } else {
      const excess = durationSeconds - this.OPTIMAL_DURATION_MAX;
      const penalty = (excess / 60) * 10;
      return Math.max(0, 100 - penalty);
    }
  }

  /**
   * Вычисляет итоговый скор для видео
   */
  calculateScore(
    video: VideoMetadata,
    searchQuery: string,
    artistName: string = ""
  ): ScoredVideo {
    const breakdown: ScoreBreakdown = {
      titleMatch: this.calculateTitleScore(video.title, searchQuery),
      keywords: this.calculateKeywordsScore(video.title),
      channelTrust: this.calculateChannelScore(video.channelName, artistName),
      views: this.calculateViewsScore(video.viewCount || 0),
      likes: this.calculateLikesScore(video.likeCount || 0, video.viewCount || 0),
      duration: this.calculateDurationScore(video.duration || 0),
    };

    // Взвешенная сумма
    const totalScore = (
      breakdown.titleMatch * (this.WEIGHT_TITLE_MATCH / 100) +
      breakdown.keywords * (this.WEIGHT_OFFICIAL_KEYWORDS / 100) +
      breakdown.channelTrust * (this.WEIGHT_CHANNEL_TRUST / 100) +
      breakdown.views * (this.WEIGHT_VIEW_COUNT / 100) +
      breakdown.likes * (this.WEIGHT_LIKE_RATIO / 100) +
      breakdown.duration * (this.WEIGHT_DURATION / 100)
    );

    return {
      ...video,
      score: totalScore,
      scoreBreakdown: breakdown,
    };
  }

  /**
   * Оценивает и фильтрует список видео
   */
  scoreAndRank(
    videos: VideoMetadata[],
    searchQuery: string,
    artistName: string = ""
  ): ScoredVideo[] {
    const scored = videos.map(video =>
      this.calculateScore(video, searchQuery, artistName)
    );

    // Фильтруем по минимальному скору
    const filtered = scored.filter(
      v => v.score >= this.MIN_TOTAL_SCORE
    );

    // Сортируем по убыванию скора
    filtered.sort((a, b) => b.score - a.score);

    return filtered;
  }
}

