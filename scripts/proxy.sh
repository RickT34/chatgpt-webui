# Sourced before Python/uv bootstrap. Never evaluates desktop configuration as code.
# Precedence: explicit override > proxy environment > manual desktop settings.
setup_http=${http_proxy-${HTTP_PROXY-}}
setup_https=${https_proxy-${HTTPS_PROXY-}}
setup_all=${all_proxy-${ALL_PROXY-}}
setup_bypass=${no_proxy-${NO_PROXY-}}
setup_source=environment
if [ "${CHATGPT_WEB_PROXY+x}" = x ]; then
    setup_http=$CHATGPT_WEB_PROXY
    setup_https=$CHATGPT_WEB_PROXY
    setup_all=$CHATGPT_WEB_PROXY
    setup_source=override
elif [ -z "$setup_http$setup_https$setup_all" ]; then
    setup_source=
    setup_kde_file="${XDG_CONFIG_HOME:-$HOME/.config}/kioslaverc"
    setup_kde_value() {
        awk -v wanted="$1" '
            /^\[Proxy Settings\]/{section=1;next}
            /^\[/{section=0}
            section {separator=index($0,"="); if(substr($0,1,separator-1)==wanted){print substr($0,separator+1);exit}}
        ' "$setup_kde_file"
    }
    if [ -r "$setup_kde_file" ] && command -v awk >/dev/null 2>&1 && [ "$(setup_kde_value ProxyType)" = 1 ]; then
        setup_http=$(setup_kde_value httpProxy | sed -E 's/ ([0-9]+)$/:\1/')
        setup_https=$(setup_kde_value httpsProxy | sed -E 's/ ([0-9]+)$/:\1/')
        setup_all=$(setup_kde_value socksProxy | sed -E 's/ ([0-9]+)$/:\1/;s#^socks://#socks5h://#')
        setup_source='KDE manual settings'
        if [ -z "${no_proxy+x}${NO_PROXY+x}" ]; then setup_bypass=$(setup_kde_value NoProxyFor); fi
    elif command -v gsettings >/dev/null 2>&1 && [ "$(gsettings get org.gnome.system.proxy mode 2>/dev/null)" = "'manual'" ]; then
        setup_gnome_proxy() {
            setup_host=$(gsettings get "org.gnome.system.proxy.$1" host 2>/dev/null | sed "s/^'//;s/'$//")
            setup_port=$(gsettings get "org.gnome.system.proxy.$1" port 2>/dev/null)
            if [ -n "$setup_host" ] && [ "$setup_port" -gt 0 ] 2>/dev/null; then
                case "$setup_host" in *:*) setup_host="[$setup_host]" ;; esac
                setup_scheme=http; if [ "$1" = socks ]; then setup_scheme=socks5h; fi
                printf '%s://%s:%s' "$setup_scheme" "$setup_host" "$setup_port"
            fi
        }
        setup_http=$(setup_gnome_proxy http)
        setup_https=$(setup_gnome_proxy https)
        setup_all=$(setup_gnome_proxy socks)
        setup_source='GNOME manual settings'
        if [ -z "${no_proxy+x}${NO_PROXY+x}" ]; then
            setup_bypass=$(gsettings get org.gnome.system.proxy ignore-hosts 2>/dev/null | tr -d "[]' ")
        fi
    fi
fi
# Tools disagree about ALL_PROXY and case. Supply consistent scheme-specific values.
setup_http=${setup_http:-${setup_all:-$setup_https}}
setup_https=${setup_https:-${setup_all:-$setup_http}}
if [ -n "$setup_http$setup_https$setup_all" ] || [ "${CHATGPT_WEB_PROXY+x}" = x ]; then
    export http_proxy="$setup_http" HTTP_PROXY="$setup_http"
    export https_proxy="$setup_https" HTTPS_PROXY="$setup_https"
    export all_proxy="$setup_all" ALL_PROXY="$setup_all"
    export no_proxy="$setup_bypass" NO_PROXY="$setup_bypass"
    # npm may otherwise prefer a stale proxy in a user npmrc.
    export npm_config_proxy="$setup_http" npm_config_https_proxy="$setup_https" npm_config_noproxy="$setup_bypass"
    printf '[setup] Download proxy source: %s (address and credentials hidden)\n' "$setup_source" >&2
fi
unset setup_http setup_https setup_all setup_bypass setup_source setup_kde_file setup_host setup_port setup_scheme
