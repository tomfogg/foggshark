var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0)-10;
var color = d3.scale.category10();
var color2 = d3.scale.category20();

var force = d3.layout.force()
.charge(-120)
.linkDistance(30)
.size([width, height]);

var svg = d3.select("body").append("svg")
.attr("width", width)
.attr("height", height);

d3.json("nodes.json", function(error, graph) {

    var nodes = graph.nodes.slice(),
        links = [],
        bilinks = [];

    graph.links.forEach(function(link) {
        var s = nodes[link.source],
            t = nodes[link.target],
            i = {}; // intermediate node
        nodes.push(i);
        s.size = Math.min(s.size,50);
        t.size = Math.min(t.size,50);
        links.push({source: s, target: i, port: +link.port}, {source: i, target: t, port: +link.port});
        bilinks.push([s, i, t, +link.port]);
    });

    force
    .nodes(nodes)
    .links(links)
    .gravity(0.5)
    .size([width, height])
    .charge(function(d) { return d.size ? -d.size*100 : -1000; });

    var ports = [80,3306,11211,443,21,25,22,8080];
    var portnames = ['http','mysql','memcache','https','ftp','smtp','ssh','http'];

    // dropshadow filter
    var defs = svg.append('defs');
    var filter = defs.append("filter")
    .attr("id", "drop-shadow")
    .attr("height", "150%");
    filter.append("feGaussianBlur")
    .attr("in", "SourceAlpha")
    .attr("stdDeviation", 5)
    .attr("result", "blur");
    filter.append("feOffset")
    .attr("in", "blur")
    .attr("dx", 5)
    .attr("dy", 5)
    .attr("result", "offsetBlur");
    var feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode")
    .attr("in", "offsetBlur");
    feMerge.append("feMergeNode")
    .attr("in", "SourceGraphic");

    // add an arrow for each line
    var arrows = defs.selectAll('.arrow')
    .data(bilinks)
    .enter()
    .append('marker')
    .style("pointer-events", "none")
    .attr({
        'id':function(d,i) { return 'arrow'+i;},
        'class': 'arrow',
        'viewBox':'-0 -5 10 10',
        'refX': 10,
        'refY':0,
        'orient':'auto',
        'markerWidth':10,
        'markerHeight':10,
        'xoverflow':'visible'
    }).append('svg:path')
    .style("fill", function(d) { var p = ports.indexOf(d[3]); return p == -1 ? color2(0) : color2(p+1); })
    .attr('d', 'M 0,-5 L 10 ,0 L 0,5');
    
    // add a circle for each host group
    var node = svg.selectAll('.node')
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("class", "node")
    .attr("r", function(d) { return d.size; })
    .style("fill", function(d) { return color(d.group); })
    .call(force.drag);

    // draw lines between hosts
    var link = svg.selectAll(".link")
    .data(bilinks)
    .enter()
    .append("path")
    .attr("class", "link")
    .style("pointer-events", "none")
    .attr("id", function(d,i) { return "link"+i;})
    .attr('marker-end',function(d,i) { return 'url(#arrow'+i+')'; })
    .style("filter", "url(#drop-shadow)")
    .style("stroke", function(d) { var p = ports.indexOf(d[3]); return p == -1 ? color2(0) : color2(p+1); });

    // label the ports on the lines
    var labels = svg.selectAll(".llabel")
    .data(bilinks)
    .enter()
    .append('text')
    .style("pointer-events", "none")
    .attr({'class':'llabel',
          'id':function(d,i){return 'llabel'+i;},
          'dx':40,
          'dy':0
    });

    // make the label follow the line curve
    labels.append('textPath')
    .attr('xlink:href',function(d,i) {return '#link'+i;})
    .style("pointer-events", "none")
    .text(function(d){ return ports.indexOf(d[3]) !== -1 ? portnames[ports.indexOf(d[3])] : d[3];});

    // add mouseover for ip of host
    node.append("title")
    .text(function(d) { return d.name; });

    // redraw the graph
    force.on("tick", function() {
        link.attr("d", function(d) {return "M"+d[0].x+","+d[0].y+"S"+d[1].x+","+d[1].y+" "+d[2].x+","+d[2].y;});
        node.attr("transform", function(d) { 
            return 'translate(' + [d.x, d.y] + ')'; 
        });    
    });
   
    // generate a decent graph 
    force.start();
    for (var i = 200; i > 0; --i) force.tick();
    force.stop();
});