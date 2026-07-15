import * as cheerio from "cheerio";

const AD_HINTS = [
  "ad",
  "ads",
  "advert",
  "tjtag",
  "sponsor",
  "adfloat",
  "article-ads",
  "post-card-ads",
  "popup",
  "xqbj",
];


function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*热搜\s*HOT\s*/gi, " ")
    .replace(/\s*HOT\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAd($el) {
  const cls = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`.toLowerCase();
  if (AD_HINTS.some((h) => cls.includes(h))) return true;
  const href = ($el.attr("href") || "").toLowerCase();
  if (href && !href.startsWith("/") && !href.includes("91cg") && !href.includes("archives")) {
    // external promo links often ads
  }
  return false;
}

export function parseListPage(html, baseUrl) {
  const $ = cheerio.load(html);
  const posts = [];
  const seen = new Set();

  $("article").each((_, el) => {
    const $art = $(el);
    if ($art.find(".post-card-ads").length) return;
    if (looksLikeAd($art)) return;

    const $a = $art.find('a[href*="/archives/"]').first();
    const href = $a.attr("href") || "";
    const m = href.match(/\/archives\/(\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);

    let title =
      $art.find(".post-card-title").first().text().trim() ||
      $art.find('[itemprop="headline"]').first().text().trim() ||
      $a.attr("title") ||
      $art.find("h2").first().text().trim() ||
      "";
    title = cleanTitle(title);
    if (title.length < 4) title = `内容 ${id}`;

    let cover = "";
    const scripts = $art.find("script").toArray();
    for (const s of scripts) {
      const t = $(s).html() || "";
      const bm = t.match(/loadBannerDirect\(\s*['"]([^'"]+)['"]/);
      if (bm) {
        cover = bm[1];
        break;
      }
    }
    if (!cover) {
      cover =
        $art.find("img[data-xkrkllgl]").attr("data-xkrkllgl") ||
        $art.find("img[data-src]").attr("data-src") ||
        $art.find("img").attr("src") ||
        "";
    }

    const date =
      $art.find("time").attr("datetime") ||
      $art.find('[itemprop="datePublished"]').attr("content") ||
      $art.find('[itemprop="dateModified"]').attr("content") ||
      "";

    const cats = [];
    $art.find('a[href*="/category/"]').each((__, c) => {
      const name = $(c).text().trim();
      const ch = $(c).attr("href") || "";
      const cm = ch.match(/\/category\/([^/]+)/);
      if (name && cm) cats.push({ slug: cm[1], name });
    });

    posts.push({
      id,
      title: title || `内容 ${id}`,
      cover,
      date,
      categories: cats,
      path: `/archives/${id}/`,
    });
  });

  // pagination
  let nextPage = null;
  let prevPage = null;
  let currentPage = 1;
  const pageLink = $('link[rel="next"]').attr("href") || "";
  const prevLink = $('link[rel="prev"]').attr("href") || "";
  const curMatch = (baseUrl || "").match(/\/page\/(\d+)/);
  if (curMatch) currentPage = parseInt(curMatch[1], 10);
  if (pageLink) {
    const nm = pageLink.match(/\/page\/(\d+)/);
    nextPage = nm ? parseInt(nm[1], 10) : currentPage + 1;
  }
  if (prevLink) {
    const pm = prevLink.match(/\/page\/(\d+)/);
    prevPage = pm ? parseInt(pm[1], 10) : Math.max(1, currentPage - 1);
  }
  // fallback from nav
  if (!nextPage) {
    $("a").each((_, a) => {
      const t = $(a).text().trim();
      const h = $(a).attr("href") || "";
      if ((t === "下一页" || t.includes("下一页") || $(a).hasClass("next")) && h.includes("/page/")) {
        const nm = h.match(/\/page\/(\d+)/);
        if (nm) nextPage = parseInt(nm[1], 10);
      }
    });
  }

  const categories = [];
  const catSeen = new Set();
  $('a[href*="/category/"]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const name = $(a).text().trim();
    const m = href.match(/\/category\/([^/]+)/);
    if (!m || !name || name.length > 20) return;
    if (catSeen.has(m[1])) return;
    catSeen.add(m[1]);
    categories.push({ slug: m[1], name });
  });

  return { posts, categories, page: currentPage, nextPage, prevPage };
}

export function parseDetailPage(html, id) {
  const $ = cheerio.load(html);
  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().replace(/\s*-\s*91.*/, "").trim() ||
    `内容 ${id}`;

  const date =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time").attr("datetime") ||
    $('meta[itemprop="datePublished"]').attr("content") ||
    "";

  const categories = [];
  const catSeen = new Set();
  // prefer video type name on first player; avoid global nav pollution
  const vtype = $(".dplayer").first().attr("data-video_type_name");
  if (vtype) categories.push({ slug: "", name: vtype });
  $("article .post-meta a[href*='/category/'], .post-title + * a[href*='/category/']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const name = $(a).text().trim();
    const m = href.match(/\/category\/([^/]+)/);
    if (!m || !name || name.length > 16) return;
    if (catSeen.has(m[1])) return;
    catSeen.add(m[1]);
    categories.push({ slug: m[1], name });
  });

  // videos from dplayer data-config
  const videos = [];
  $(".dplayer").each((i, el) => {
    const $el = $(el);
    const cfgRaw = $el.attr("data-config") || "";
    let url = "";
    let vtitle = $el.attr("data-video_title") || `视频 ${i + 1}`;
    try {
      const cfg = JSON.parse(cfgRaw);
      url = cfg?.video?.url || "";
    } catch {
      const um = cfgRaw.match(/"url"\s*:\s*"([^"]+m3u8[^"]*)"/);
      if (um) url = um[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    }
    if (url) {
      videos.push({
        title: vtitle,
        url: url.replace(/\\\//g, "/"),
        type: "hls",
      });
    }
  });

  // content body
  const $content = $(".post-content").first();
  // remove ad nodes
  $content.find("script, style, .article-ads-btn, .dplayer, noscript").remove();
  $content.find("*").each((_, el) => {
    const $el = $(el);
    const cls = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`.toLowerCase();
    if (AD_HINTS.some((h) => cls.includes(h))) $el.remove();
  });

  // rewrite images
  const images = [];
  $content.find("img").each((_, img) => {
    const $img = $(img);
    const src =
      $img.attr("data-xkrkllgl") ||
      $img.attr("data-src") ||
      $img.attr("src") ||
      "";
    if (!src || src.includes("zw.png") || src.includes("favicon")) {
      // keep placeholder only if real url in data
      if (!src || src.includes("zw.png")) {
        $img.remove();
        return;
      }
    }
    // skip obvious ad gifs from hc237 other
    if (src.includes("/other/") && src.includes("hc237")) {
      $img.remove();
      return;
    }
    images.push(src);
    $img.attr("src", `/api/img?url=${encodeURIComponent(src)}`);
    $img.removeAttr("data-xkrkllgl data-src data-xuid srcset");
    $img.attr("loading", "lazy");
  });

  // strip promo blockquotes / permanent address spam
  $content.find("blockquote").each((_, bq) => {
    const t = $(bq).text();
    if (/最新地址|永久地址|无法访问|91vip|91cg@|回家的路/.test(t)) $(bq).remove();
  });
  $content.find("p").each((_, p) => {
    const t = $(p).text().trim();
    if (!t) return;
    if (/^91吃瓜/.test(t) && /地址|主页|浏览器/.test(t)) $(p).remove();
    if (/发送任何内容到邮箱|获取最新网址/.test(t)) $(p).remove();
  });
  $content.find("a").each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") || "";
    if (/sponsored|nofollow/.test($a.attr("rel") || "") && !href.includes("/archives/")) {
      $a.replaceWith($a.text());
      return;
    }
    if (href.includes("/archives/")) {
      const m = href.match(/\/archives\/(\d+)/);
      if (m) $a.attr("href", `/#/post/${m[1]}`);
    }
  });

  // remove site promo tables / keyword footers
  $content.find("table").each((_, tb) => {
    const txt = $(tb).text();
    if (/今日吃瓜|必吃大瓜|海角乱伦|明星黑料/.test(txt)) $(tb).remove();
  });
  $content.find("p").each((_, p) => {
    const txt = $(p).text().trim();
    if (/^关键词[：:]/.test(txt)) $(p).remove();
    if (/91吃瓜推荐/.test(txt)) $(p).remove();
    if (/可能你会感兴趣/.test(txt)) $(p).remove();
  });
  $content.find("a.btn, .btn-primary").each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") || "";
    if (href.includes("/#/post/") || href.includes("/archives/")) {
      // keep related post as plain link text row
      return;
    }
  });

  let htmlBody = $content.html() || "";
  // light cleanup
  htmlBody = htmlBody
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/(<br\s*\/?>\s*){3,}/g, "<br><br>")
    .replace(/<span[^>]*menu_index[^>]*>\s*<\/span>/g, "")
    .trim();

  // tags
  const tags = [];
  $('a[href*="/tag/"], .tags a, .post-tags a').each((_, a) => {
    const name = $(a).text().trim();
    if (name && name.length < 30) tags.push(name);
  });

  // cover from og
  const cover =
    $('meta[property="og:image"]').attr("content") ||
    images[0] ||
    "";

  return {
    id: String(id),
    title: cleanTitle(title),
    date,
    categories,
    tags: [...new Set(tags)].slice(0, 30),
    cover,
    videos,
    images,
    html: htmlBody,
  };
}
