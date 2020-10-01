const lines = `
float luma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

float luma(vec4 color) {
    return dot(color.rgb, vec3(0.299, 0.587, 0.114));
}

float lines( in float l, in vec2 fragCoord, in vec2 resolution, in vec2 range, in vec2 range2, float scale, float radius){
    vec2 center = vec2(resolution.x/2., resolution.y/2.);
    vec2 uv = fragCoord.xy;

    vec2 d = uv - center;
    float r = length(d)/1000.;
    float a = atan(d.y,d.x) + scale*(radius-r)/radius;
    vec2 uvt = center+r*vec2(cos(a),sin(a));

    vec2 uv2 = fragCoord.xy / resolution.xy;
    float c = range2.x + range2.y * sin(uvt.x*1000.);
    float f = smoothstep(range.x*c, range.y*c, l );
    f = smoothstep( 0., .5, f );

    return f;
}`;

export { lines };
