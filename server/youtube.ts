import axios from 'axios';
import { VideoScorer } from './youtube-scorer';

interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  duration?: number;
  viewCount?: number;
  likeCount?: number;
}

/**
 * Поиск видео на YouTube по названию трека и артисту
 * Использует парсинг HTML страницы YouTube (публичный метод, без API ключа)
 * Возвращает video ID для embed
 * Использует систему скоринга для выбора лучшего результата
 */
export async function searchYouTubeVideo(trackTitle: string, artist: string): Promise<string | null> {
  try {
    const scorer = new VideoScorer();
    
    // Формируем поисковый запрос с вариациями для лучшей релевантности
    const queries = [
      `${trackTitle} ${artist} official music video`,
      `${trackTitle} ${artist} official video`,
      `"${trackTitle}" "${artist}" official`,
      `${artist} ${trackTitle} official`,
      `${trackTitle} ${artist}`,
    ];

    const allCandidates: VideoMetadata[] = [];
    const searchQuery = `${trackTitle} ${artist}`;
    
    // Пробуем каждый вариант запроса
    for (const query of queries.slice(0, 2)) { // Ограничиваем до 2 запросов для скорости
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      
      try {
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 6000,
        });

        const html = response.data as string;
        
        // Ищем JSON данные в script тегах
        const ytInitialDataMatches = html.match(/var ytInitialData\s*=\s*({.+?});/s);
        if (ytInitialDataMatches && ytInitialDataMatches[1]) {
          try {
            const data = JSON.parse(ytInitialDataMatches[1]);
            
            // Извлекаем video ID из результатов поиска
            const searchContents = 
              data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ||
              data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
            
            if (searchContents && Array.isArray(searchContents)) {
              for (const section of searchContents) {
                const itemSection = section?.itemSectionRenderer?.contents;
                if (itemSection && Array.isArray(itemSection)) {
                  for (const item of itemSection) {
                    const videoRenderer = item?.videoRenderer;
                    if (videoRenderer?.videoId) {
                      // Извлекаем метаданные
                      const videoId = videoRenderer.videoId;
                      const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || '';
                      const channelName = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.ownerText?.simpleText || '';
                      
                      // Парсим длительность
                      let duration = 0;
                      const lengthText = videoRenderer.lengthText?.simpleText || '';
                      if (lengthText) {
                        const parts = lengthText.split(':').map(Number);
                        if (parts.length === 2) {
                          duration = parts[0] * 60 + parts[1];
                        } else if (parts.length === 3) {
                          duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
                        }
                      }
                      
                      // Парсим количество просмотров (примерно)
                      let viewCount = 0;
                      const viewCountText = videoRenderer.viewCountText?.simpleText || '';
                      if (viewCountText) {
                        const match = viewCountText.match(/([\d.]+)\s*([MK]?)/);
                        if (match) {
                          const num = parseFloat(match[1]);
                          const unit = match[2];
                          if (unit === 'M') viewCount = Math.round(num * 1_000_000);
                          else if (unit === 'K') viewCount = Math.round(num * 1_000);
                          else viewCount = Math.round(num);
                        }
                      }
                      
                      // Проверяем длительность (исключаем слишком короткие < 60 сек и слишком длинные > 2 часа)
                      if (duration > 0 && (duration < 60 || duration > 7200)) {
                        continue;
                      }
                      
                      // Проверяем наличие превью
                      if (videoRenderer.thumbnail?.thumbnails?.length) {
                        allCandidates.push({
                          videoId,
                          title,
                          channelName,
                          duration,
                          viewCount,
                        });
                      }
                      
                      // Ограничиваем количество кандидатов для скорости
                      if (allCandidates.length >= 15) break;
                    }
                  }
                }
                if (allCandidates.length >= 15) break;
              }
            }
          } catch (parseError) {
            // Пробуем следующий запрос
            continue;
          }
        }
        
        // Если нашли достаточно кандидатов, выходим
        if (allCandidates.length >= 10) break;
        
      } catch (queryError) {
        // Пробуем следующий запрос
        continue;
      }
    }
    
    if (allCandidates.length === 0) {
      return null;
    }
    
    // Дедупликация по videoId
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(v => [v.videoId, v])).values()
    );
    
    // Оцениваем и ранжируем результаты
    const scored = scorer.scoreAndRank(uniqueCandidates, searchQuery, artist);
    
    // Возвращаем лучший результат
    const best = scored[0];
    if (best && best.score >= 30) {
      return best.videoId;
    }
    
    // Если ничего не подошло, возвращаем первый результат
    return uniqueCandidates[0]?.videoId || null;
    
  } catch (error) {
    console.error('[YouTube] Error searching video:', error instanceof Error ? error.message : error);
    return null;
  }
}
