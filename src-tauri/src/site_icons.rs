use base64::{engine::general_purpose::STANDARD, Engine};
use kuchikiki::traits::TendrilSink;
use std::{io::Read, time::Duration};
use url::Url;

fn web_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Unsupported icon URL".into());
    }
    Ok(url)
}

fn bounded_body(response: ureq::Response, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Icon response is too large".into());
    }
    Ok(bytes)
}

fn candidates(html: &str, page: &Url) -> Vec<Url> {
    let document = kuchikiki::parse_html().one(html);
    let base = document
        .select_first("base[href]")
        .ok()
        .and_then(|node| page.join(node.attributes.borrow().get("href")?).ok())
        .unwrap_or_else(|| page.clone());
    let mut urls = Vec::new();
    if let Ok(links) = document.select("link[rel][href]") {
        for link in links {
            let attributes = link.attributes.borrow();
            let rel = attributes.get("rel").unwrap_or_default();
            if rel.split_ascii_whitespace().any(|token| {
                token.eq_ignore_ascii_case("icon") || token.eq_ignore_ascii_case("apple-touch-icon")
            }) {
                if let Ok(url) = base.join(attributes.get("href").unwrap_or_default()) {
                    if web_url(url.as_str()).is_ok() && !urls.contains(&url) {
                        urls.push(url);
                    }
                }
            }
        }
    }
    urls.truncate(3);
    if let Ok(url) = page.join("/favicon.ico") {
        if !urls.contains(&url) {
            urls.push(url);
        }
    }
    urls
}

#[tauri::command]
pub async fn get_site_icon(url: String) -> Result<Option<String>, String> {
    let page = web_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(4))
            .redirects(3)
            .build();
        let response = agent
            .get(page.as_str())
            .set("User-Agent", "HudBrowse/1.0")
            .call()
            .map_err(|error| error.to_string())?;
        let final_url = web_url(response.get_url())?;
        let html = bounded_body(response, 1_048_576)?;
        for candidate in candidates(&String::from_utf8_lossy(&html), &final_url) {
            let Ok(response) = agent.get(candidate.as_str()).call() else {
                continue;
            };
            let mime = response
                .header("content-type")
                .unwrap_or("image/x-icon")
                .split(';')
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            if !matches!(
                mime.as_str(),
                "image/png"
                    | "image/jpeg"
                    | "image/gif"
                    | "image/webp"
                    | "image/svg+xml"
                    | "image/x-icon"
                    | "image/vnd.microsoft.icon"
                    | "application/octet-stream"
            ) {
                continue;
            }
            let Ok(bytes) = bounded_body(response, 524_288) else {
                continue;
            };
            return Ok(Some(format!(
                "data:{mime};base64,{}",
                STANDARD.encode(bytes)
            )));
        }
        Ok(None)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_real_icon_links_and_ignores_unrelated_resources() {
        let page = Url::parse("https://example.com/docs/page").unwrap();
        let icons = candidates(
            r#"<base href="/assets/"><link rel="stylesheet" href="no.css"><link rel="shortcut ICON" href="brand.png"><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="javascript:alert(1)">"#,
            &page,
        );
        assert_eq!(
            icons.iter().map(Url::as_str).collect::<Vec<_>>(),
            vec![
                "https://example.com/assets/brand.png",
                "https://example.com/touch.png",
                "https://example.com/favicon.ico"
            ]
        );
    }
}
