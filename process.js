#!/usr/bin/env node

var dns = require('dns');

function loaddump(callback) {
    var last = "";
    var links = {};
    function doline(line) {
        var m = line.match(/([\d.]+)>([\d.]+):(\d+)/);
        if(m) {
            var port = m[3];
            var fromhost = m[1];
            var tohost = m[2];
            if(!links[port+':'+fromhost]) links[port+':'+fromhost] = [];
            if(!links[tohost+':'+port]) links[tohost+':'+port] = [];
            if(links[port+':'+fromhost].indexOf(tohost) === -1) links[port+':'+fromhost].push(tohost);
            if(links[tohost+':'+port].indexOf(fromhost) === -1) links[tohost+':'+port].push(fromhost);
        }
    }
    process.stdin.on('readable', function() {
        var chunk = process.stdin.read();
        if(chunk !== null) {
            var lines, i;
            lines = (last+chunk).split("\n");
            for(i = 0; i < lines.length - 1; i++) {
                doline(lines[i]);
            }
            last = lines[i];
        }
    });
    process.stdin.on('end', function() {
        doline(last);
        callback(links);
    });
}

function grouplinks(links,callback) {
    var out = [];
    for(var i in links) {
        var lname = '';
        var m = 0;
        var source = '';
        var target = '';
        if((m = i.match(/^(\d+):([\d.]+)$/))) {
            port = m[1];
            source = [m[2]];
            target = links[i];
            lname = links[i][0]+':'+port;
        } else if((m = i.match(/^([\d.]+):(\d+)$/))) {
            source = links[i];
            target = [m[1]];
            port = m[2];
            lname = port+':'+links[i][0];
        }
        if(links[i].length === 1) {
            if(links[lname].length === 1) out.push({source: source, target: target, port: port});
        } else out.push({source: source, target: target, port: port});
    }

    // number of links per node
    linkcount = {};
    for(i in out) {
        out[i].source.concat(out[i].target).map(function(d) {
            linkcount[d] = linkcount[d] ? linkcount[d]+1 : 1;
        });
    }

    var o = [];
    var hosts = [];
    var allhosts = [];
    var outlink = [];
    var set = {};
    for(i in out) {
        var swap = false;
        var from = out[i].source;
        var to = out[i].target;
        if(out[i].source.length > out[i].target.length) {
            from = out[i].target;
            to = out[i].source;
            swap = true;
        }
        if(hosts.indexOf(from[0]) === -1) hosts.push(from[0]);
        if(allhosts.indexOf(from[0]) === -1) allhosts.push(from[0]);
        var source = hosts.indexOf(from[0]);
        var group = [];
        var singles = [];
        to.map(function(d) {
            if(allhosts.indexOf(d)) allhosts.push(d);
            if(to.length === 1 || linkcount[d] > 1) {
                if(hosts.indexOf(d) === -1) hosts.push(d);
                singles.push(hosts.indexOf(d));
            } else group.push(d);
        });
        if(group.length) {
            outlink.push({
                source: swap ? hosts.push(group.join(' '))-1 : source, 
                target: swap ? source : hosts.push(group.join(' '))-1, 
                port: out[i].port });
        }
        singles.map(function(d) {
            var h = source+d+out[i].port;
            if(!set[h]) {
                set[h] = 1;
                outlink.push({
                    source: swap ? d : source, 
                    target: swap ? source : d, 
                    port: out[i].port });
            }
        });
    }

    callback(outlink,allhosts,hosts);
}

function showlinks(links,cache,hosts,port) {
    var out = JSON.stringify({nodes: hosts.map(function(d) {
        var name = d.split(/ /).map(function(h) {
            return cache[h] ? cache[h] : h;
        }).join(' ');
        var group = 0;
        if(name.match(/^10\./) || name.match(/^192\./)) group = 1;
        else if(name.match(/^ec2-/)) group = 2;
        else if(name.match(/amazonaws/)) group = 3;
        else if(name.match(/cloudfront/)) group = 4;
        else if(name.match(/^s3/)) group = 5;
        else if(name.match(/[a-z]/)) group = 6;
        return {name: name, group: group, size: d.length}; 
    }), links: links});

    var express = require('express');
    var app = express();
    app.use(function(req,res,next) { console.log(req.method+':'+req.url); return next();});
    app.use('/', express.static(__dirname));
    app.use('/nodes.json', function(req,res) {
        res.writeHead(200);
        res.end(out);
    });
    app.listen(port, function() { console.log('open http://127.0.0.1:'+port+'/'); });

}

opt = require('node-getopt').create([
  ['n' , ''                    , 'disable DNS lookup.'],
  ['p' , 'port=ARG'                    , 'disable DNS lookup.'],
  ['h' , 'help'                , 'display this help']
])
.setHelp(
  "Usage: foggshark [OPTION]\n" +
  " collect tcpdump logs with this command:\n\n" +
  "   sudo tcpdump -nnl 'tcp[13] == 2' | perl -ne '$|=1;/([\\d.]+)\\.(\\d+) > ([\\d.]+)\\.(\\d+)/;$f=$1;$t=$3;$p=$4;if($4>30000){$f=$3;$t=$1;$p=$2;}$o=\"$f>$t:$p\\n\";if(!$s{$o}){$s{$o}=1;print$o;}'> `hostname`.log\n\n" +
  " produce the graphs with this command:\n\n"+
  "   cat *.log | foggshark\n\n"+
  "Options:\n" +
  "[[OPTIONS]]\n" +
  "\n")
.bindHelp()
.parseSystem();
var serverport = 8000;
if(opt.options.port) serverport = opt.options.port;

loaddump(function(links) {
    console.log('importing dump');
    grouplinks(links,function(outlink,allhosts,hosts) {
        var c = 0;
        var cache = {};
        if(opt.options.n) showlinks(outlink,cache,hosts,serverport);
        else {
            console.log('doing dns lookup');
            allhosts.map(function(h) {
                dns.reverse(h,function(err,hn) {
                    if(hn === undefined) hn = [h];
                    cache[h] = hn[0];
                    c++;
                    if(c >= allhosts.length) showlinks(outlink,cache,hosts,serverport);
                });
            });
        }
    });
});
