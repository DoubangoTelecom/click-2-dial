document.write(unescape("%3Cscript src='https://sipml5.googlecode.com/svn/trunk/release/SIPml-api.js' type='text/javascript'%3E%3C/script%3E"));

if(!window.c2c){
    c2c = { debug: true };
}
c2c.config = {};
c2c.started = false;
c2c.callSession = null;

c2c.add_html_elts = function(parent, elements) {
    var tag_parent = document.getElementsByTagName(parent)[0];
    elements.forEach(function (element) {
        var tag_elt = document.createElement(element.type);
        element.attributes.forEach(function (attribute) {
            tag_elt.setAttribute(attribute.name, attribute.value);
        });
        var s = document.getElementsByTagName(element.type);
        if(s && s.length > 0){
            s[0].parentNode.insertBefore(tag_elt, s[0]);
        }
        else{
            tag_parent.appendChild(tag_elt);
        }
    });
};

if(c2c.debug){
    c2c.add_html_elts('head',
        [
            { type: 'script', attributes: [{ name: 'type', value: 'text/javascript' }, { name: 'src', value: './c2c-base64.js' }] },
            { type: 'script', attributes: [{ name: 'type', value: 'text/javascript' }, { name: 'src', value: './c2c-md5.js' }] }
        ]
    );
}
else{ // release
c2c.add_html_elts('body',
        [
            { type: 'link', attributes: [{ name: 'href', value: 'http://click2dial.org/assets/css/bootstrap.css' }, { name: 'rel', value: 'stylesheet' }] },
            { type: 'link', attributes: [{ name: 'href', value: 'http://click2dial.org/assets/css/bootstrap-responsive.css' }, { name: 'rel', value: 'stylesheet' }] }
        ]
    );
}

c2c.buildAuthToken = function (email, password) {
    // auth-token = md5('password' ':' 'email' 'click2call.org');
    return MD5.hexdigest(password + ':' + email + ':' + 'click2call.org');
}

c2c.buildHa1 = function (impi, realm, password) {
    /* RFC 2617 - 3.2.2.2 A1
		A1       = unq(username-value) ":" unq(realm-value) ":" passwd
	*/
    return MD5.hexdigest(impi + ':' + realm + ':' + password);
}

// to avoid spaming when added to and HTML page
c2c.obfuscate = function (address) {
    // obuscated SIP address = base64('sip-address');
    return Base64.encode(address);
}

c2c.unobfuscate = function (address) {
    return Base64.decode(address);
}

c2c.init = function () {
    tsk_utils_log_info('[C2C] c2c.init()');

    c2c.audio_remote = document.createElement('audio');
    c2c.audio_remote.autoplay = "autoplay";
    c2c.audio_ringbacktone = document.createElement('audio');
    c2c.audio_ringbacktone.src = "http://click2dial.org/sounds/ringbacktone.wav";
    c2c.audio_ringbacktone.loop = true;

    document.write(
        "<a href='#' class='btn btn-large btn-success' id='c2c_btn_call' style='position:fixed; visibility:hidden; z-index:98; top: 35%; right: 0px; -webkit-transform: rotate(-90deg); -moz-transform: rotate(-90deg);'>call us &raquo;</a>"
    );
    document.write(
        "<div id='c2c_div_glass' style='"+
            "visibility:hidden;"+
            "z-index: 99;"+
            "position: fixed;"+
            "width: 100%;"+
            "height: 100%;"+
            "margin: 0;"+
            "padding: 0;"+
            "top: 0;"+
            "left: 0;"+
            "opacity: 0.8;"+
            "background-color: Gray'"+
        "></div>"
    );

    c2c.div_glass = document.getElementById('c2c_div_glass');
    c2c.button_call = document.getElementById('c2c_btn_call');
    if(c2c.cls){
        c2c.button_call.setAttribute("class", c2c.cls);
    }
    c2c.button_call.innerHTML = c2c.button_call._innerHTML = c2c.text ? c2c.text : 'call us &raquo;';
    c2c.button_call.onclick = function () {
        if (!c2c.stack) {
            var websocket_proxy_url = (tsk_string_is_null_or_empty(c2c.config.websocket_proxy_url) && window.localStorage) ? window.localStorage.getItem('org.doubango.click2dial.admin.websocket_server_url') : c2c.config.websocket_proxy_url;
            var sip_outbound_proxy_url = (tsk_string_is_null_or_empty(c2c.config.sip_outbound_proxy_url) && window.localStorage) ? window.localStorage.getItem('org.doubango.click2dial.admin.sip_outboundproxy_url') : c2c.config.sip_outbound_proxy_url;
            
            if(tsk_string_is_null_or_empty(websocket_proxy_url)){
                // there are at least 5 servers running on the cloud.
                // we will connect to one of them and let the balancer to choose the right one (less connected sockets)
                // each port can accept up to 65K connections which means that the cloud can manage 325K active connections
                // the number of port will be increased or decreased based on the current trafic

                // webrtc2sip 2.0+ (Doubango): 
                //      WS: 10060, 11060, 12060, 13060, 14060
                //      WSS: 10062, 11062, 12062, 13062, 14062
                //
        
                var port = (true/*secure*/ ? 10062 : 10060) + (((new Date().getTime()) % /*FIXME:5*/1) * 1000);
                var host = "ns313841.ovh.net";
                websocket_proxy_url = "wss://" + host + ":" + port;
            }
            
            c2c.stack = new SIPml.Stack({ realm: 'click2dial.org', impi: c2c.from, impu: 'sip:' + c2c.from + '@click2dial.org', password: 'mysecret',
                events_listener: { events: '*', listener: function (e) {
                    tsk_utils_log_info('[C2C] stack event = ' + e.type);

                    switch (e.type) {
                        case 'started':
                            {
                                c2c.started = true;
                                c2c.call();
                                break;
                            }
                        case 'stopped':
                        case 'stopping':
                            {
                                c2c.callSession = null;
                                c2c.audio_ringbacktone.pause();
                                c2c.started = false;
                                c2c.button_call.innerHTML = c2c.button_call._innerHTML;
                                break;
                            }
                        case 'm_permission_requested':
                            {
                                if(c2c.glass){
                                    c2c.div_glass.style.visibility = 'visible';
                                }
                                break;
                            }
                        case 'm_permission_accepted':
                        case 'm_permission_refused':
                            {
                                c2c.div_glass.style.visibility = 'hidden';
                                break;
                            }
                            break;
                    }//switch
                } //callback
                }, //events_listener
                enable_rtcweb_breaker: true, // to allow calling SIP-legacy networks
                enable_click2call: true, // signal to the gw that called user have to be searched using the click2call service
                websocket_proxy_url: websocket_proxy_url,
                outbound_proxy_url: sip_outbound_proxy_url
            }/*stack-config*/);
        }
        if (!c2c.started) {
            c2c.stack.start();
        }
        else{
            c2c.call();
        }
    };

    document.body.appendChild(c2c.button_call);
    document.body.appendChild(c2c.audio_remote);

    SIPml.init(
                function (e) { // successCallback
                    c2c.button_call.style.visibility = 'visible';
                },
                function (e) { // errorCallback
                    c2c.button_call.innerHTML = e.description;
                }
            );
}

c2c.signup = function (name, email, successCallback, errorCallback) {
    var JSONText = JSON.stringify
        (
               {
                   action: 'req_account_add',
                   name: name,
                   email: email
               }
        );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.activate = function (code, email, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_activate',
                email: email,
                code: code
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.linkaddress = function (base_url, email) {
    return base_url + '/u/' + c2c.obfuscate(email);
}

c2c.signin = function (email, password, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_info',
                email: email,
                auth_token: c2c.buildAuthToken(email, password)
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.add_sip_address = function (email, password, address, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_sip_add',
                email: email,
                auth_token: c2c.buildAuthToken(email, password),
                sip: {
                    address: address
                }
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.delete_sip_address = function (email, password, id, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_sip_delete',
                email: email,
                auth_token: c2c.buildAuthToken(email, password),
                id: id
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.add_sip_caller = function (email, password, display_name, impu, impi, realm, password_sip, address_id, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_sip_caller_add',
                email: email,
                auth_token: c2c.buildAuthToken(email, password),
                display_name: display_name,
                impu: impu,
                impi: impi,
                realm: realm,
                account_sip_id: address_id,
                ha1: c2c.buildHa1(impi, realm, password_sip)
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}

c2c.delete_sip_caller = function (email, password, id, successCallback, errorCallback) {
    var JSONText = JSON.stringify
    (
            {
                action: 'req_account_sip_caller_delete',
                email: email,
                auth_token: c2c.buildAuthToken(email, password),
                id: id
            }
    );
    return c2c._send_data(JSONText, successCallback, errorCallback);
}


c2c.call = function(from){
    tsk_utils_log_info('[C2C] c2c.call()');

    if(!c2c.stack){
        // link-address hack
        c2c.button_call.click();
        return;
    }

    if(c2c.callSession){
        c2c.callSession.hangup();
        return;
    }

    var from = (from || c2c.from);
    var to = (c2c.to || from);

    var call_listener = function(e){
        tsk_utils_log_info('[C2C] session event = ' + e.type);
        switch (e.type) {
            case 'connecting': case 'connected':
                {
                    if (e.session == c2c.callSession) {
                        c2c.button_call.innerHTML = ((e.type === 'connecting') ? 'calling...' : 'in call');
                    }
                    break;
                }
               case 'i_ao_request':
                {
                    if(e.session == c2c.callSession){
                        var code = e.getSipResponseCode();
                        if (code == 180 || code == 183) {
                            c2c.audio_ringbacktone.play();
                            c2c.button_call.innerHTML = 'ringing...';
                        }
                    }
                    break;
                }
               case 'm_early_media':
                {
                    if(e.session == c2c.callSession){
                        c2c.audio_ringbacktone.pause();
                        c2c.button_call.innerHTML = 'early media...';
                    }
                    break;
                }

            case 'terminating': case 'terminated':
                {
                    if (e.session == c2c.callSession) {
                        c2c.button_call.innerHTML = e.description.toLowerCase();
                        c2c.callSession = null;
                        c2c.audio_ringbacktone.pause();
                        c2c.div_glass.style.visibility = 'hidden';
                        window.setTimeout(function(){ c2c.button_call.innerHTML = c2c.button_call._innerHTML; }, 2000);
                    }
                    break;
                }
        }
    };

    
    c2c.callSession = c2c.stack.newSession('call-audio', {
                from: from,
                audio_remote: c2c.audio_remote,
                video_local: null,
                video_remote: null,
                events_listener: { events: '*', listener: call_listener },
                sip_caps: [
                                { name: '+g.oma.sip-im' },
                                { name: '+sip.ice' },
                                { name: 'language', value: '\"en,fr\"' }
                            ]
            });
    c2c.callSession.call(to);
}

c2c._send_data = function(data, successCallback, errorCallback){
    var httServUrl = (tsk_string_is_null_or_empty(c2c.config.http_service_url) && window.localStorage) ? window.localStorage.getItem('org.doubango.click2dial.admin.http_server_url') : c2c.config.http_service_url;    
    var xmlhttp = window.XMLHttpRequest ? new XMLHttpRequest() : (window.XDomainRequest ? window.XDomainRequest : new ActiveXObject("MSXML2.XMLHTTP.3.0"));

    if(tsk_string_is_null_or_empty(httServUrl)){
        // there are at least 5 servers running on the cloud.
        // we will connect to one of them and let the balancer to choose the right one (less connected sockets)
        // each port can accept up to 65K connections which means that the cloud can manage 325K active connections
        // the number of port will be increased or decreased based on the current trafic

        // webrtc2sip 2.3+ (Doubango): 
        //      HTTP: 10070, 11070, 12070, 13070, 14070
        //      HTTPS: 10072, 11072, 12072, 13072, 14072
        //
        
        var port = (true/*secure*/ ? 10072 : 10060) + (((new Date().getTime()) % /*FIXME:5*/1) * 1000);
        var host = "ns313841.ovh.net";
        httServUrl = "https://" + host + ":" + port;
    }

    xmlhttp.onreadystatechange = function (e) {
        var JSONObject;
        try{
            if (this.readyState == this.DONE) {
                if (this.status == 200){
                    if(this.responseText != null){
                        tsk_utils_log_info('[C2C] RECV: ' + this.responseText);
                        JSONObject = JSON.parse(this.responseText);
                    }
                    if(successCallback){
                        successCallback({ status: this.status, statusText: this.statusText, JSONObject: JSONObject });
                    }
                }
                else{
                    if(errorCallback){
                        errorCallback({ status: this.status, statusText: tsk_string_is_null_or_empty(this.statusText) ? 'timeout' : this.statusText, JSONObject: JSONObject });
                    }
                }
            }
            
        }
        catch(ex){
            if(errorCallback){
                errorCallback({ status: 600, statusText: ex.toString(), JSONObject: null });
            }
        }
    }

    xmlhttp.open("POST", httServUrl, true);
    xmlhttp.setRequestHeader("Content-type", "application/json");

    tsk_utils_log_info('[C2C] SEND['+httServUrl+']: ' + 'not displayed'/*data*/);

    xmlhttp.send(data);
}

