/*! LaunchNote "What's new" widget */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-project");
  if (!slug) {
    console.warn("[LaunchNote] Missing data-project attribute");
    return;
  }

  // load only once per page
  var loadedKey = "__launchnote_" + slug;
  if (window[loadedKey]) return;
  window[loadedKey] = true;

  var origin = new URL(script.src).origin;

  // ---------- options ----------
  var side = script.getAttribute("data-position") === "bottom-left" ? "left" : "right";
  var colorAttr = script.getAttribute("data-color") || "";
  var color = /^#[0-9a-fA-F]{3,8}$/.test(colorAttr) ? colorAttr : "#4f46e5";
  var label = (script.getAttribute("data-label") || "What's new").slice(0, 24);
  var triggerSelector = script.getAttribute("data-trigger");

  var CATEGORY = {
    NEW: "New",
    IMPROVED: "Improved",
    FIXED: "Fixed",
    ANNOUNCEMENT: "Announcement",
  };

  // ---------- helpers ----------
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  }

  function visitorId() {
    try {
      var id = localStorage.getItem("launchnote:vid");
      if (!id) {
        id = uuid();
        localStorage.setItem("launchnote:vid", id);
      }
      return id;
    } catch (e) {
      return uuid();
    }
  }

  var seenKey = "launchnote:seen:" + slug;
  function getSeen() {
    try {
      return localStorage.getItem(seenKey);
    } catch (e) {
      return null;
    }
  }
  function setSeen(value) {
    try {
      localStorage.setItem(seenKey, value);
    } catch (e) {}
  }

  function track(type, ref) {
    try {
      fetch(origin + "/embed/" + encodeURIComponent(slug) + "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ type: type, vid: visitorId(), ref: ref }),
      }).catch(function () {});
    } catch (e) {}
  }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "class") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "border:0;border-radius:999px;padding:11px 18px;background:var(--c);color:#fff;font-size:14px;font-weight:600;" +
    "cursor:pointer;box-shadow:0 6px 20px rgba(15,23,42,.25)}" +
    ".launcher:hover{filter:brightness(1.08)}" +
    ".dot{position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:50%;background:#ef4444;border:2px solid #fff}" +
    ".panel{position:fixed;bottom:78px;" + side + ":20px;z-index:2147483001;display:none;flex-direction:column;" +
    "width:360px;max-width:calc(100vw - 24px);max-height:min(520px,calc(100vh - 100px));background:#fff;color:#0f172a;" +
    "border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.28);overflow:hidden}" +
    ".panel.open{display:flex}" +
    ".head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--c);color:#fff}" +
    ".head strong{font-size:15px}" +
    ".close{border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}" +
    ".list{overflow-y:auto}" +
    ".item{display:block;padding:14px 16px;border-top:1px solid #e2e8f0;text-decoration:none;color:inherit}" +
    ".item:first-child{border-top:0}" +
    ".item:hover{background:#f8fafc}" +
    ".meta{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;color:#64748b}" +
    ".badge{border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}" +
    ".c-NEW{background:#d1fae5;color:#047857}.c-IMPROVED{background:#dbeafe;color:#1d4ed8}" +
    ".c-FIXED{background:#fef3c7;color:#b45309}.c-ANNOUNCEMENT{background:#f3e8ff;color:#7e22ce}" +
    ".title{font-size:14px;font-weight:600;margin:0 0 4px}" +
    ".excerpt{font-size:13px;line-height:1.5;color:#475569;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".empty{padding:28px 16px;text-align:center;font-size:14px;color:#64748b}" +
    ".foot{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px}" +
    ".foot a{color:var(--c);text-decoration:none;font-weight:600}.foot span{color:#94a3b8}";

  // ---------- load data, then build the UI ----------
  fetch(origin + "/embed/" + encodeURIComponent(slug) + "/posts")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(build)
    .catch(function (err) {
      console.warn("[LaunchNote] Could not load updates:", err.message || err);
    });

  function build(data) {
    var posts = data.posts || [];
    var siteBase = (data.siteUrl || "").replace(/\/$/, "") + "/p/" + encodeURIComponent(slug);

    var host = document.createElement("div");
    var root = host.attachShadow({ mode: "open" });
    root.appendChild(h("style", { text: CSS }));
    host.style.setProperty("--c", color);

    var latest = posts.length ? posts[0].publishedAt : null;
    var seen = getSeen();
    var unread = !!latest && (!seen || new Date(latest) > new Date(seen));

    var triggerEl = triggerSelector ? document.querySelector(triggerSelector) : null;

    var dot = unread ? h("span", { class: "dot" }) : null;
    var launcher = triggerEl
      ? null
      : h("button", { class: "launcher", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" }, [
          h("span", { text: label }),
          dot,
        ]);

    var closeBtn = h("button", { class: "close", type: "button", "aria-label": "Close", text: "\u00d7" });
    var list = h("div", { class: "list" });

    if (posts.length === 0) {
      list.appendChild(h("div", { class: "empty", text: "No updates yet." }));
    }

    posts.forEach(function (p) {
      var href = data.siteUrl ? siteBase + "/" + encodeURIComponent(p.slug) : "#";
      var date = new Date(p.publishedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      var a = h(
        "a",
        { class: "item", href: href, target: "_blank", rel: "noopener noreferrer" },
        [
          h("div", { class: "meta" }, [
            h("span", { class: "badge c-" + p.category, text: CATEGORY[p.category] || p.category }),
            h("span", { text: date }),
          ]),
          h("p", { class: "title", text: p.title }),
          p.excerpt ? h("p", { class: "excerpt", text: p.excerpt }) : null,
        ]
      );
      a.addEventListener("click", function () {
        track("click", p.slug);
      });
      list.appendChild(a);
    });

    var panel = h(
      "div",
      { class: "panel", role: "dialog", "aria-label": label },
      [
        h("div", { class: "head" }, [h("strong", { text: label }), closeBtn]),
        list,
        h("div", { class: "foot" }, [
          data.siteUrl
            ? h("a", { href: siteBase, target: "_blank", rel: "noopener noreferrer", text: "View all updates" })
            : h("span", { text: "" }),
          h("span", { text: "Powered by LaunchNote" }),
        ]),
      ]
    );

    if (launcher) root.appendChild(launcher);
    root.appendChild(panel);
    document.body.appendChild(host);

    var isOpen = false;

    function open() {
      isOpen = true;
      panel.classList.add("open");
      if (launcher) launcher.setAttribute("aria-expanded", "true");
      if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
      if (latest) setSeen(latest);
      track("open");
    }

    function close() {
      isOpen = false;
      panel.classList.remove("open");
      if (launcher) launcher.setAttribute("aria-expanded", "false");
    }

    function toggle() {
      if (isOpen) close();
      else open();
    }

    if (launcher) launcher.addEventListener("click", toggle);
    if (triggerEl) triggerEl.addEventListener("click", toggle);
    closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) close();
    });

    document.addEventListener("click", function (e) {
      if (!isOpen) return;
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(host) !== -1) return;
      if (triggerEl && path.indexOf(triggerEl) !== -1) return;
      close();
    });
  }
})();