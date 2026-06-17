// lib/cli.mjs
import { realpathSync, readFileSync as readFileSync11 } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// lib/doctor.mjs
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// lib/git.mjs
import { spawnSync } from "node:child_process";
function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout ?? opts.defaultTimeout ?? 3e4
  });
  const err = (
    /** @type {any} */
    res.error
  );
  const timedOut = err?.code === "ETIMEDOUT" || res.error == null && res.signal != null && res.status == null;
  if (timedOut) return { stdout: res.stdout ?? "", stderr: `anchor: command timed out: ${cmd}`, code: 124 };
  if (res.error) return { stdout: "", stderr: String(res.error.message), code: 127 };
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? (res.signal ? 128 : 0)
  };
}
function runGit(args, opts = {}) {
  return runCmd("git", args, opts);
}
function isGitRepo(dir) {
  return runGit(["rev-parse", "--is-inside-work-tree"], { cwd: dir }).stdout.trim() === "true";
}
function shortHead(dir) {
  const r = runGit(["rev-parse", "--short", "HEAD"], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}
function hasCmd(cmd) {
  return runCmd(cmd, ["--version"]).code === 0;
}
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// lib/config.mjs
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// node_modules/.pnpm/js-yaml@4.2.0/node_modules/js-yaml/dist/js-yaml.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
    key = keys[i];
    if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
  value: mod,
  enumerable: true
}) : target, mod));
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) result += string;
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  module.exports.isNothing = isNothing;
  module.exports.isObject = isObject;
  module.exports.toArray = toArray;
  module.exports.repeat = repeat;
  module.exports.isNegativeZero = isNegativeZero;
  module.exports.extend = extend;
}));
var require_exception = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function formatError(exception, compact) {
    let where = "";
    const message = exception.reason || "(unknown reason)";
    if (!exception.mark) return message;
    if (exception.mark.name) where += 'in "' + exception.mark.name + '" ';
    where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
    if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    else this.stack = (/* @__PURE__ */ new Error()).stack || "";
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  module.exports = YAMLException2;
}));
var require_snippet = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match2;
    let foundLineNo = -1;
    while (match2 = re.exec(mark.buffer)) {
      lineEnds.push(match2.index);
      lineStarts.push(match2.index + match2[0].length);
      if (mark.position <= match2.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
      result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
      result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  module.exports = makeSnippet;
}));
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map) {
    const result = {};
    if (map !== null) Object.keys(map).forEach(function(style) {
      map[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
  module.exports = Type2;
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var Type2 = require_type();
  function compileList(schema, name) {
    const result = [];
    schema[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type) {
      if (type.multi) {
        result.multi[type.kind].push(type);
        result.multi["fallback"].push(type);
      } else result[type.kind][type.tag] = result["fallback"][type.tag] = type;
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) explicit.push(definition);
    else if (Array.isArray(definition)) explicit = explicit.concat(definition);
    else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    implicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      if (type.loadKind && type.loadKind !== "scalar") throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      if (type.multi) throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    });
    explicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  module.exports = Schema2;
}));
var require_str = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
}));
var require_seq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
}));
var require_map = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
}));
var require_failsafe = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_schema())({ explicit: [
    require_str(),
    require_seq(),
    require_map()
  ] });
}));
var require_null = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  module.exports = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_bool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  module.exports = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_int = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type2 = require_type();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") ch = data[++index];
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) return false;
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return Number.isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
  }
  module.exports = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
}));
var require_float = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type2 = require_type();
  var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) return false;
    if (Number.isFinite(parseFloat(data, 10))) return true;
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
    if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    else if (value === ".nan") return NaN;
    return sign * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
    else if (Number.POSITIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
    else if (Number.NEGATIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
    else if (common.isNegativeZero(object)) return "-0.0";
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  module.exports = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
}));
var require_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_failsafe().extend({ implicit: [
    require_null(),
    require_bool(),
    require_int(),
    require_float()
  ] });
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_json();
}));
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
  var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match2 = YAML_DATE_REGEXP.exec(data);
    if (match2 === null) match2 = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match2 === null) throw new Error("Date resolve error");
    const year = +match2[1];
    const month = +match2[2] - 1;
    const day = +match2[3];
    if (!match2[4]) return new Date(Date.UTC(year, month, day));
    const hour = +match2[4];
    const minute = +match2[5];
    const second = +match2[6];
    if (match2[7]) {
      fraction = match2[7].slice(0, 3);
      while (fraction.length < 3) fraction += "0";
      fraction = +fraction;
    }
    if (match2[9]) {
      const tzHour = +match2[10];
      const tzMinute = +(match2[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match2[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  module.exports = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
}));
var require_merge = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  module.exports = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
}));
var require_binary = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) result.push(bits >> 4 & 255);
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map[bits >> 18 & 63];
        result += map[bits >> 12 & 63];
        result += map[bits >> 6 & 63];
        result += map[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map[bits >> 18 & 63];
      result += map[bits >> 12 & 63];
      result += map[bits >> 6 & 63];
      result += map[bits & 63];
    } else if (tail === 2) {
      result += map[bits >> 10 & 63];
      result += map[bits >> 4 & 63];
      result += map[bits << 2 & 63];
      result += map[64];
    } else if (tail === 1) {
      result += map[bits >> 2 & 63];
      result += map[bits << 4 & 63];
      result += map[64];
      result += map[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  module.exports = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
}));
var require_omap = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = [];
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) if (_hasOwnProperty.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
      else return false;
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  module.exports = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
}));
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  module.exports = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
}));
var require_set = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  module.exports = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
}));
var require_default = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_core().extend({
    implicit: [require_timestamp(), require_merge()],
    explicit: [
      require_binary(),
      require_omap(),
      require_pairs(),
      require_set()
    ]
  });
}));
var require_loader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var makeSnippet = require_snippet();
  var DEFAULT_SCHEMA2 = require_default();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) return lc - 97 + 10;
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) return 2;
    if (c === 117) return 4;
    if (c === 85) return 8;
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) return String.fromCharCode(c);
    return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
    else object[key] = value;
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxMergeSeqLength = typeof options["maxMergeSeqLength"] === "number" ? options["maxMergeSeqLength"] : 20;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) state.onWarning.call(null, generateError(state, message));
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) transaction[name] = {
        existed: _hasOwnProperty.call(state.anchorMap, name),
        value: state.anchorMap[name]
      };
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) parent[name] = transaction[name];
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) state.anchorMap[names[index]] = entry.value;
      else delete state.anchorMap[names[index]];
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) throwError(state, "duplication of %YAML directive");
      if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
      const match2 = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match2 === null) throwError(state, "ill-formed argument of the YAML directive");
      const major = parseInt(match2[1], 10);
      const minor = parseInt(match2[2], 10);
      if (major !== 1) throwError(state, "unacceptable YAML version of the document");
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      if (_hasOwnProperty.call(state.tagMap, handle)) throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
        const _character = _result.charCodeAt(_position);
        if (!(_character === 9 || _character >= 32 && _character <= 1114111)) throwError(state, "expected valid JSON character");
      }
      else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
    keyNode = String(keyNode);
    if (_result === null) _result = {};
    if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) {
      if (valueNode.length > state.maxMergeSeqLength) throwError(state, "merge sequence length exceeded maxMergeSeqLength (" + state.maxMergeSeqLength + ")");
      const seen = /* @__PURE__ */ new Set();
      for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        const src = valueNode[index];
        if (seen.has(src)) continue;
        seen.add(src);
        mergeMappings(state, _result, src, overridableKeys);
      }
    } else mergeMappings(state, _result, valueNode, overridableKeys);
    else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) state.position++;
    else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) state.position++;
    } else throwError(state, "a line break is expected");
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 10 && ch !== 13 && ch !== 0);
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else break;
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) return true;
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) state.result += " ";
    else if (count > 1) state.result += common.repeat("\n", count - 1);
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) return false;
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) break;
      } else if (ch === 35) {
        if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) break;
      else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) captureEnd = state.position + 1;
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) return true;
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else return true;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (isEol(ch)) skipSeparationSpace(state, false, nodeIndent);
      else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        let hexLength = tmp;
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
          else throwError(state, "expected hexadecimal character");
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else throwError(state, "unknown escape sequence");
      captureStart = captureEnd = state.position;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) throwError(state, "missed comma between flow collection entries");
      else if (ch === 44) throwError(state, "expected the node content, but found ','");
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        if (isWsOrEol(state.input.charCodeAt(state.position + 1))) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      else _result.push(keyNode);
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else readNext = false;
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) folding = false;
    else if (ch === 62) folding = true;
    else return false;
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      else throwError(state, "repeat of a chomping mode identifier");
      else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else throwError(state, "repeat of an indentation width identifier");
      else break;
    }
    if (isWhiteSpace(ch)) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (isWhiteSpace(ch));
      if (ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (!isEol(ch) && ch !== 0);
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) throwError(state, "missing indentation for block scalar");
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) state.result += "\n";
        }
        break;
      }
      if (folding) if (isWhiteSpace(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) state.result += " ";
      } else state.result += common.repeat("\n", emptyLines);
      else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) break;
      if (!isWsOrEol(state.input.charCodeAt(state.position + 1))) break;
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
          else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
        else valueNode = state.result;
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) throwError(state, "duplication of a tag property");
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else tagHandle = "!";
    let _position = state.position;
    if (isVerbatim) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else throwError(state, "unexpected end of the stream within a verbatim tag");
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
          isNamed = true;
          _position = state.position + 1;
        } else throwError(state, "tag suffix cannot contain exclamation marks");
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) state.tag = tagName;
    else if (_hasOwnProperty.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
    else if (tagHandle === "!") state.tag = "!" + tagName;
    else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
    else throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) throwError(state, "duplication of an anchor property");
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) throwError(state, 'unidentified alias "' + alias + '"');
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    state.depth += 1;
    if (state.listener !== null) state.listener("open", state);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      }
    }
    if (indentStatus === 1) while (true) {
      const ch = state.input.charCodeAt(state.position);
      const propertyState = snapshotState(state);
      if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) break;
      if (!readTagProperty(state) && !readAnchorProperty(state)) break;
      if (propertyStart === null) propertyStart = propertyState;
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      } else allowBlockCollections = false;
    }
    if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
      else flowIndent = parentIndent + 1;
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
      else {
        const ch = state.input.charCodeAt(state.position);
        if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) hasContent = true;
        else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
        else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) state.tag = "?";
        }
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
      else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
    if (state.tag === null) {
      if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type = state.implicitTypes[typeIndex];
        if (type.resolve(state.result)) {
          state.result = type.construct(state.result);
          state.tag = type.tag;
          if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
      else {
        type = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
      if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
      if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
      if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      else {
        state.result = type.construct(state.result, state.tag);
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
    }
    if (state.listener !== null) state.listener("close", state);
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) break;
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
      while (ch !== 0) {
        while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
        if (ch === 35) {
          do
            ch = state.input.charCodeAt(++state.position);
          while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
      else throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) throwError(state, "directives end mark is expected");
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) input += "\n";
      if (input.charCodeAt(0) === 65279) input = input.slice(1);
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) readDocument(state);
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") return documents;
    for (let index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) return;
    else if (documents.length === 1) return documents[0];
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  module.exports.loadAll = loadAll2;
  module.exports.load = load2;
}));
var require_dumper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var DEFAULT_SCHEMA2 = require_default();
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema, map) {
    if (map === null) return {};
    const result = {};
    const keys = Object.keys(map);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map[tag]);
      if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
      const type = schema.compiledTypeMap["fallback"][tag];
      if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) if (state.implicitTypes[index].resolve(str)) return true;
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
    }
    return first;
  }
  function needIndentIndicator(string) {
    return /^\n* /.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) return STYLE_DOUBLE;
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
    if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string, lineWidth) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    return indentIndicator + (clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-") + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = (function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match2;
    while (match2 = lineRe.exec(string)) {
      const prefix = match2[1];
      const line = match2[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match2;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match2 = breakRe.exec(line)) {
      next = match2.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    else result += line.slice(start);
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else result += escapeSeq || encodeHex(char);
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") _result += generateNextLine(state, level);
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
        else _result += "- ";
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level, objectKey, false, false)) continue;
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) continue;
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) objectKeyList.sort();
    else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
    else if (state.sortKeys) throw new YAMLException2("sortKeys must be a boolean or a function");
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
      else pairBuffer += "? ";
      pairBuffer += state.dump;
      if (explicitPair) pairBuffer += generateNextLine(state, level);
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
      else pairBuffer += ": ";
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type = typeList[index];
      if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
        if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
        else state.tag = type.tag;
        else state.tag = "?";
        if (type.represent) {
          const style = state.styleMap[type.tag] || type.defaultStyle;
          let _result;
          if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
          else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
          else throw new YAMLException2("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) detectType(state, object, true);
    const type = _toString.call(state.dump);
    const inblock = block;
    if (block) block = state.flowLevel < 0 || state.flowLevel > level;
    const objectOrArray = type === "[object Object]" || type === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
    if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
    else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
      if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object Array]") if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
        else writeBlockSequence(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object String]") {
        if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
      } else if (type === "[object Undefined]") return false;
      else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
        if (state.tag[0] === "!") tagStr = "!" + tagStr;
        else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
        else tagStr = "!<" + tagStr + ">";
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
      } else {
        objects.push(object);
        if (Array.isArray(object)) for (let i = 0, length = object.length; i < length; i += 1) inspectNode(object[i], objects, duplicatesIndexes);
        else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) value = state.replacer.call({ "": value }, "", value);
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  module.exports.dump = dump2;
}));
var import_js_yaml = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
  var loader = require_loader();
  var dumper = require_dumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  module.exports.Type = require_type();
  module.exports.Schema = require_schema();
  module.exports.FAILSAFE_SCHEMA = require_failsafe();
  module.exports.JSON_SCHEMA = require_json();
  module.exports.CORE_SCHEMA = require_core();
  module.exports.DEFAULT_SCHEMA = require_default();
  module.exports.load = loader.load;
  module.exports.loadAll = loader.loadAll;
  module.exports.dump = dumper.dump;
  module.exports.YAMLException = require_exception();
  module.exports.types = {
    binary: require_binary(),
    float: require_float(),
    map: require_map(),
    null: require_null(),
    pairs: require_pairs(),
    set: require_set(),
    timestamp: require_timestamp(),
    bool: require_bool(),
    int: require_int(),
    merge: require_merge(),
    omap: require_omap(),
    seq: require_seq(),
    str: require_str()
  };
  module.exports.safeLoad = renamed("safeLoad", "load");
  module.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
  module.exports.safeDump = renamed("safeDump", "dump");
})))(), 1);
var { Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump } = import_js_yaml.default;
var index_vite_proxy_tmp_default = import_js_yaml.default;

// node_modules/.pnpm/balanced-match@4.0.4/node_modules/balanced-match/dist/esm/index.js
var balanced = (a, b, str) => {
  const ma = a instanceof RegExp ? maybeMatch(a, str) : a;
  const mb = b instanceof RegExp ? maybeMatch(b, str) : b;
  const r = ma !== null && mb != null && range(ma, mb, str);
  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + ma.length, r[1]),
    post: str.slice(r[1] + mb.length)
  };
};
var maybeMatch = (reg, str) => {
  const m = str.match(reg);
  return m ? m[0] : null;
};
var range = (a, b, str) => {
  let begs, beg, left, right = void 0, result;
  let ai = str.indexOf(a);
  let bi = str.indexOf(b, ai + 1);
  let i = ai;
  if (ai >= 0 && bi > 0) {
    if (a === b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;
    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length === 1) {
        const r = begs.pop();
        if (r !== void 0)
          result = [r, bi];
      } else {
        beg = begs.pop();
        if (beg !== void 0 && beg < left) {
          left = beg;
          right = bi;
        }
        bi = str.indexOf(b, i + 1);
      }
      i = ai < bi && ai >= 0 ? ai : bi;
    }
    if (begs.length && right !== void 0) {
      result = [left, right];
    }
  }
  return result;
};

// node_modules/.pnpm/brace-expansion@5.0.6/node_modules/brace-expansion/dist/esm/index.js
var escSlash = "\0SLASH" + Math.random() + "\0";
var escOpen = "\0OPEN" + Math.random() + "\0";
var escClose = "\0CLOSE" + Math.random() + "\0";
var escComma = "\0COMMA" + Math.random() + "\0";
var escPeriod = "\0PERIOD" + Math.random() + "\0";
var escSlashPattern = new RegExp(escSlash, "g");
var escOpenPattern = new RegExp(escOpen, "g");
var escClosePattern = new RegExp(escClose, "g");
var escCommaPattern = new RegExp(escComma, "g");
var escPeriodPattern = new RegExp(escPeriod, "g");
var slashPattern = /\\\\/g;
var openPattern = /\\{/g;
var closePattern = /\\}/g;
var commaPattern = /\\,/g;
var periodPattern = /\\\./g;
var EXPANSION_MAX = 1e5;
function numeric(str) {
  return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}
function escapeBraces(str) {
  return str.replace(slashPattern, escSlash).replace(openPattern, escOpen).replace(closePattern, escClose).replace(commaPattern, escComma).replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
  return str.replace(escSlashPattern, "\\").replace(escOpenPattern, "{").replace(escClosePattern, "}").replace(escCommaPattern, ",").replace(escPeriodPattern, ".");
}
function parseCommaParts(str) {
  if (!str) {
    return [""];
  }
  const parts = [];
  const m = balanced("{", "}", str);
  if (!m) {
    return str.split(",");
  }
  const { pre, body, post } = m;
  const p = pre.split(",");
  p[p.length - 1] += "{" + body + "}";
  const postParts = parseCommaParts(post);
  if (post.length) {
    ;
    p[p.length - 1] += postParts.shift();
    p.push.apply(p, postParts);
  }
  parts.push.apply(parts, p);
  return parts;
}
function expand(str, options = {}) {
  if (!str) {
    return [];
  }
  const { max = EXPANSION_MAX } = options;
  if (str.slice(0, 2) === "{}") {
    str = "\\{\\}" + str.slice(2);
  }
  return expand_(escapeBraces(str), max, true).map(unescapeBraces);
}
function embrace(str) {
  return "{" + str + "}";
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}
function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}
function expand_(str, max, isTop) {
  const expansions = [];
  const m = balanced("{", "}", str);
  if (!m)
    return [str];
  const pre = m.pre;
  const post = m.post.length ? expand_(m.post, max, false) : [""];
  if (/\$$/.test(m.pre)) {
    for (let k = 0; k < post.length && k < max; k++) {
      const expansion = pre + "{" + m.body + "}" + post[k];
      expansions.push(expansion);
    }
  } else {
    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    const isSequence = isNumericSequence || isAlphaSequence;
    const isOptions = m.body.indexOf(",") >= 0;
    if (!isSequence && !isOptions) {
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + "{" + m.body + escClose + m.post;
        return expand_(str, max, true);
      }
      return [str];
    }
    let n;
    if (isSequence) {
      n = m.body.split(/\.\./);
    } else {
      n = parseCommaParts(m.body);
      if (n.length === 1 && n[0] !== void 0) {
        n = expand_(n[0], max, false).map(embrace);
        if (n.length === 1) {
          return post.map((p) => m.pre + n[0] + p);
        }
      }
    }
    let N;
    if (isSequence && n[0] !== void 0 && n[1] !== void 0) {
      const x = numeric(n[0]);
      const y = numeric(n[1]);
      const width = Math.max(n[0].length, n[1].length);
      let incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
      let test = lte;
      const reverse = y < x;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      const pad = n.some(isPadded);
      N = [];
      for (let i = x; test(i, y) && N.length < max; i += incr) {
        let c;
        if (isAlphaSequence) {
          c = String.fromCharCode(i);
          if (c === "\\") {
            c = "";
          }
        } else {
          c = String(i);
          if (pad) {
            const need = width - c.length;
            if (need > 0) {
              const z = new Array(need + 1).join("0");
              if (i < 0) {
                c = "-" + z + c.slice(1);
              } else {
                c = z + c;
              }
            }
          }
        }
        N.push(c);
      }
    } else {
      N = [];
      for (let j = 0; j < n.length; j++) {
        N.push.apply(N, expand_(n[j], max, false));
      }
    }
    for (let j = 0; j < N.length; j++) {
      for (let k = 0; k < post.length && expansions.length < max; k++) {
        const expansion = pre + N[j] + post[k];
        if (!isTop || isSequence || expansion) {
          expansions.push(expansion);
        }
      }
    }
  }
  return expansions;
}

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/assert-valid-pattern.js
var MAX_PATTERN_LENGTH = 1024 * 64;
var assertValidPattern = (pattern) => {
  if (typeof pattern !== "string") {
    throw new TypeError("invalid pattern");
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new TypeError("pattern is too long");
  }
};

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/brace-expressions.js
var posixClasses = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true],
  "[:alpha:]": ["\\p{L}\\p{Nl}", true],
  "[:ascii:]": ["\\x00-\\x7f", false],
  "[:blank:]": ["\\p{Zs}\\t", true],
  "[:cntrl:]": ["\\p{Cc}", true],
  "[:digit:]": ["\\p{Nd}", true],
  "[:graph:]": ["\\p{Z}\\p{C}", true, true],
  "[:lower:]": ["\\p{Ll}", true],
  "[:print:]": ["\\p{C}", true],
  "[:punct:]": ["\\p{P}", true],
  "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true],
  "[:upper:]": ["\\p{Lu}", true],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true],
  "[:xdigit:]": ["A-Fa-f0-9", false]
};
var braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
var regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var rangesToString = (ranges) => ranges.join("");
var parseClass = (glob, position) => {
  const pos = position;
  if (glob.charAt(pos) !== "[") {
    throw new Error("not in a brace expression");
  }
  const ranges = [];
  const negs = [];
  let i = pos + 1;
  let sawStart = false;
  let uflag = false;
  let escaping = false;
  let negate = false;
  let endPos = pos;
  let rangeStart = "";
  WHILE: while (i < glob.length) {
    const c = glob.charAt(i);
    if ((c === "!" || c === "^") && i === pos + 1) {
      negate = true;
      i++;
      continue;
    }
    if (c === "]" && sawStart && !escaping) {
      endPos = i + 1;
      break;
    }
    sawStart = true;
    if (c === "\\") {
      if (!escaping) {
        escaping = true;
        i++;
        continue;
      }
    }
    if (c === "[" && !escaping) {
      for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
        if (glob.startsWith(cls, i)) {
          if (rangeStart) {
            return ["$.", false, glob.length - pos, true];
          }
          i += cls.length;
          if (neg)
            negs.push(unip);
          else
            ranges.push(unip);
          uflag = uflag || u;
          continue WHILE;
        }
      }
    }
    escaping = false;
    if (rangeStart) {
      if (c > rangeStart) {
        ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c));
      } else if (c === rangeStart) {
        ranges.push(braceEscape(c));
      }
      rangeStart = "";
      i++;
      continue;
    }
    if (glob.startsWith("-]", i + 1)) {
      ranges.push(braceEscape(c + "-"));
      i += 2;
      continue;
    }
    if (glob.startsWith("-", i + 1)) {
      rangeStart = c;
      i += 2;
      continue;
    }
    ranges.push(braceEscape(c));
    i++;
  }
  if (endPos < i) {
    return ["", false, 0, false];
  }
  if (!ranges.length && !negs.length) {
    return ["$.", false, glob.length - pos, true];
  }
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regexpEscape(r), false, endPos - pos, false];
  }
  const sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]";
  const snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
  const comb = ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs;
  return [comb, uflag, endPos - pos, true];
};

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/unescape.js
var unescape = (s, { windowsPathsNoEscape = false, magicalBraces = true } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/\[([^/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\])\]/g, "$1$2").replace(/\\([^/])/g, "$1");
  }
  return windowsPathsNoEscape ? s.replace(/\[([^/\\{}])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\{}])\]/g, "$1$2").replace(/\\([^/{}])/g, "$1");
};

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/ast.js
var _a;
var types2 = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var isExtglobType = (c) => types2.has(c);
var isExtglobAST = (c) => isExtglobType(c.type);
var adoptionMap = /* @__PURE__ */ new Map([
  ["!", ["@"]],
  ["?", ["?", "@"]],
  ["@", ["@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@"]]
]);
var adoptionWithSpaceMap = /* @__PURE__ */ new Map([
  ["!", ["?"]],
  ["@", ["?"]],
  ["+", ["?", "*"]]
]);
var adoptionAnyMap = /* @__PURE__ */ new Map([
  ["!", ["?", "@"]],
  ["?", ["?", "@"]],
  ["@", ["?", "@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@", "?", "*"]]
]);
var usurpMap = /* @__PURE__ */ new Map([
  ["!", /* @__PURE__ */ new Map([["!", "@"]])],
  [
    "?",
    /* @__PURE__ */ new Map([
      ["*", "*"],
      ["+", "*"]
    ])
  ],
  [
    "@",
    /* @__PURE__ */ new Map([
      ["!", "!"],
      ["?", "?"],
      ["@", "@"],
      ["*", "*"],
      ["+", "+"]
    ])
  ],
  [
    "+",
    /* @__PURE__ */ new Map([
      ["?", "*"],
      ["*", "*"]
    ])
  ]
]);
var startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))";
var startNoDot = "(?!\\.)";
var addPatternStart = /* @__PURE__ */ new Set(["[", "."]);
var justDots = /* @__PURE__ */ new Set(["..", "."]);
var reSpecials = new Set("().*{}+?[]^$\\!");
var regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var qmark = "[^/]";
var star = qmark + "*?";
var starNoEmpty = qmark + "+?";
var ID = 0;
var AST = class {
  type;
  #root;
  #hasMagic;
  #uflag = false;
  #parts = [];
  #parent;
  #parentIndex;
  #negs;
  #filledNegs = false;
  #options;
  #toString;
  // set to true if it's an extglob with no children
  // (which really means one child of '')
  #emptyExt = false;
  id = ++ID;
  get depth() {
    return (this.#parent?.depth ?? -1) + 1;
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return {
      "@@type": "AST",
      id: this.id,
      type: this.type,
      root: this.#root.id,
      parent: this.#parent?.id,
      depth: this.depth,
      partsLength: this.#parts.length,
      parts: this.#parts
    };
  }
  constructor(type, parent, options = {}) {
    this.type = type;
    if (type)
      this.#hasMagic = true;
    this.#parent = parent;
    this.#root = this.#parent ? this.#parent.#root : this;
    this.#options = this.#root === this ? options : this.#root.#options;
    this.#negs = this.#root === this ? [] : this.#root.#negs;
    if (type === "!" && !this.#root.#filledNegs)
      this.#negs.push(this);
    this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
  }
  get hasMagic() {
    if (this.#hasMagic !== void 0)
      return this.#hasMagic;
    for (const p of this.#parts) {
      if (typeof p === "string")
        continue;
      if (p.type || p.hasMagic)
        return this.#hasMagic = true;
    }
    return this.#hasMagic;
  }
  // reconstructs the pattern
  toString() {
    return this.#toString !== void 0 ? this.#toString : !this.type ? this.#toString = this.#parts.map((p) => String(p)).join("") : this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")";
  }
  #fillNegs() {
    if (this !== this.#root)
      throw new Error("should only call on root");
    if (this.#filledNegs)
      return this;
    this.toString();
    this.#filledNegs = true;
    let n;
    while (n = this.#negs.pop()) {
      if (n.type !== "!")
        continue;
      let p = n;
      let pp = p.#parent;
      while (pp) {
        for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) {
          for (const part of n.#parts) {
            if (typeof part === "string") {
              throw new Error("string part in extglob AST??");
            }
            part.copyIn(pp.#parts[i]);
          }
        }
        p = pp;
        pp = p.#parent;
      }
    }
    return this;
  }
  push(...parts) {
    for (const p of parts) {
      if (p === "")
        continue;
      if (typeof p !== "string" && !(p instanceof _a && p.#parent === this)) {
        throw new Error("invalid part: " + p);
      }
      this.#parts.push(p);
    }
  }
  toJSON() {
    const ret = this.type === null ? this.#parts.slice().map((p) => typeof p === "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
    if (this.isStart() && !this.type)
      ret.unshift([]);
    if (this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!")) {
      ret.push({});
    }
    return ret;
  }
  isStart() {
    if (this.#root === this)
      return true;
    if (!this.#parent?.isStart())
      return false;
    if (this.#parentIndex === 0)
      return true;
    const p = this.#parent;
    for (let i = 0; i < this.#parentIndex; i++) {
      const pp = p.#parts[i];
      if (!(pp instanceof _a && pp.type === "!")) {
        return false;
      }
    }
    return true;
  }
  isEnd() {
    if (this.#root === this)
      return true;
    if (this.#parent?.type === "!")
      return true;
    if (!this.#parent?.isEnd())
      return false;
    if (!this.type)
      return this.#parent?.isEnd();
    const pl = this.#parent ? this.#parent.#parts.length : 0;
    return this.#parentIndex === pl - 1;
  }
  copyIn(part) {
    if (typeof part === "string")
      this.push(part);
    else
      this.push(part.clone(this));
  }
  clone(parent) {
    const c = new _a(this.type, parent);
    for (const p of this.#parts) {
      c.copyIn(p);
    }
    return c;
  }
  static #parseAST(str, ast, pos, opt, extDepth) {
    const maxDepth = opt.maxExtglobRecursion ?? 2;
    let escaping = false;
    let inBrace = false;
    let braceStart = -1;
    let braceNeg = false;
    if (ast.type === null) {
      let i2 = pos;
      let acc2 = "";
      while (i2 < str.length) {
        const c = str.charAt(i2++);
        if (escaping || c === "\\") {
          escaping = !escaping;
          acc2 += c;
          continue;
        }
        if (inBrace) {
          if (i2 === braceStart + 1) {
            if (c === "^" || c === "!") {
              braceNeg = true;
            }
          } else if (c === "]" && !(i2 === braceStart + 2 && braceNeg)) {
            inBrace = false;
          }
          acc2 += c;
          continue;
        } else if (c === "[") {
          inBrace = true;
          braceStart = i2;
          braceNeg = false;
          acc2 += c;
          continue;
        }
        const doRecurse = !opt.noext && isExtglobType(c) && str.charAt(i2) === "(" && extDepth <= maxDepth;
        if (doRecurse) {
          ast.push(acc2);
          acc2 = "";
          const ext2 = new _a(c, ast);
          i2 = _a.#parseAST(str, ext2, i2, opt, extDepth + 1);
          ast.push(ext2);
          continue;
        }
        acc2 += c;
      }
      ast.push(acc2);
      return i2;
    }
    let i = pos + 1;
    let part = new _a(null, ast);
    const parts = [];
    let acc = "";
    while (i < str.length) {
      const c = str.charAt(i++);
      if (escaping || c === "\\") {
        escaping = !escaping;
        acc += c;
        continue;
      }
      if (inBrace) {
        if (i === braceStart + 1) {
          if (c === "^" || c === "!") {
            braceNeg = true;
          }
        } else if (c === "]" && !(i === braceStart + 2 && braceNeg)) {
          inBrace = false;
        }
        acc += c;
        continue;
      } else if (c === "[") {
        inBrace = true;
        braceStart = i;
        braceNeg = false;
        acc += c;
        continue;
      }
      const doRecurse = !opt.noext && isExtglobType(c) && str.charAt(i) === "(" && /* c8 ignore start - the maxDepth is sufficient here */
      (extDepth <= maxDepth || ast && ast.#canAdoptType(c));
      if (doRecurse) {
        const depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
        part.push(acc);
        acc = "";
        const ext2 = new _a(c, part);
        part.push(ext2);
        i = _a.#parseAST(str, ext2, i, opt, extDepth + depthAdd);
        continue;
      }
      if (c === "|") {
        part.push(acc);
        acc = "";
        parts.push(part);
        part = new _a(null, ast);
        continue;
      }
      if (c === ")") {
        if (acc === "" && ast.#parts.length === 0) {
          ast.#emptyExt = true;
        }
        part.push(acc);
        acc = "";
        ast.push(...parts, part);
        return i;
      }
      acc += c;
    }
    ast.type = null;
    ast.#hasMagic = void 0;
    ast.#parts = [str.substring(pos - 1)];
    return i;
  }
  #canAdoptWithSpace(child) {
    return this.#canAdopt(child, adoptionWithSpaceMap);
  }
  #canAdopt(child, map = adoptionMap) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canAdoptType(gc.type, map);
  }
  #canAdoptType(c, map = adoptionAnyMap) {
    return !!map.get(this.type)?.includes(c);
  }
  #adoptWithSpace(child, index) {
    const gc = child.#parts[0];
    const blank = new _a(null, gc, this.options);
    blank.#parts.push("");
    gc.push(blank);
    this.#adopt(child, index);
  }
  #adopt(child, index) {
    const gc = child.#parts[0];
    this.#parts.splice(index, 1, ...gc.#parts);
    for (const p of gc.#parts) {
      if (typeof p === "object")
        p.#parent = this;
    }
    this.#toString = void 0;
  }
  #canUsurpType(c) {
    const m = usurpMap.get(this.type);
    return !!m?.has(c);
  }
  #canUsurp(child) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canUsurpType(gc.type);
  }
  #usurp(child) {
    const m = usurpMap.get(this.type);
    const gc = child.#parts[0];
    const nt = m?.get(gc.type);
    if (!nt)
      return false;
    this.#parts = gc.#parts;
    for (const p of this.#parts) {
      if (typeof p === "object") {
        p.#parent = this;
      }
    }
    this.type = nt;
    this.#toString = void 0;
    this.#emptyExt = false;
  }
  static fromGlob(pattern, options = {}) {
    const ast = new _a(null, void 0, options);
    _a.#parseAST(pattern, ast, 0, options, 0);
    return ast;
  }
  // returns the regular expression if there's magic, or the unescaped
  // string if not.
  toMMPattern() {
    if (this !== this.#root)
      return this.#root.toMMPattern();
    const glob = this.toString();
    const [re, body, hasMagic, uflag] = this.toRegExpSource();
    const anyMagic = hasMagic || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob.toUpperCase() !== glob.toLowerCase();
    if (!anyMagic) {
      return body;
    }
    const flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
    return Object.assign(new RegExp(`^${re}$`, flags), {
      _src: re,
      _glob: glob
    });
  }
  get options() {
    return this.#options;
  }
  // returns the string match, the regexp source, whether there's magic
  // in the regexp (so a regular expression is required) and whether or
  // not the uflag is needed for the regular expression (for posix classes)
  // TODO: instead of injecting the start/end at this point, just return
  // the BODY of the regexp, along with the start/end portions suitable
  // for binding the start/end in either a joined full-path makeRe context
  // (where we bind to (^|/), or a standalone matchPart context (where
  // we bind to ^, and not /).  Otherwise slashes get duped!
  //
  // In part-matching mode, the start is:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: ^(?!\.\.?$)
  // - if dots allowed or not possible: ^
  // - if dots possible and not allowed: ^(?!\.)
  // end is:
  // - if not isEnd(): nothing
  // - else: $
  //
  // In full-path matching mode, we put the slash at the START of the
  // pattern, so start is:
  // - if first pattern: same as part-matching mode
  // - if not isStart(): nothing
  // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
  // - if dots allowed or not possible: /
  // - if dots possible and not allowed: /(?!\.)
  // end is:
  // - if last pattern, same as part-matching mode
  // - else nothing
  //
  // Always put the (?:$|/) on negated tails, though, because that has to be
  // there to bind the end of the negated pattern portion, and it's easier to
  // just stick it in now rather than try to inject it later in the middle of
  // the pattern.
  //
  // We can just always return the same end, and leave it up to the caller
  // to know whether it's going to be used joined or in parts.
  // And, if the start is adjusted slightly, can do the same there:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
  // - if dots allowed or not possible: (?:/|^)
  // - if dots possible and not allowed: (?:/|^)(?!\.)
  //
  // But it's better to have a simpler binding without a conditional, for
  // performance, so probably better to return both start options.
  //
  // Then the caller just ignores the end if it's not the first pattern,
  // and the start always gets applied.
  //
  // But that's always going to be $ if it's the ending pattern, or nothing,
  // so the caller can just attach $ at the end of the pattern when building.
  //
  // So the todo is:
  // - better detect what kind of start is needed
  // - return both flavors of starting pattern
  // - attach $ at the end of the pattern when creating the actual RegExp
  //
  // Ah, but wait, no, that all only applies to the root when the first pattern
  // is not an extglob. If the first pattern IS an extglob, then we need all
  // that dot prevention biz to live in the extglob portions, because eg
  // +(*|.x*) can match .xy but not .yx.
  //
  // So, return the two flavors if it's #root and the first child is not an
  // AST, otherwise leave it to the child AST to handle it, and there,
  // use the (?:^|/) style of start binding.
  //
  // Even simplified further:
  // - Since the start for a join is eg /(?!\.) and the start for a part
  // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
  // or start or whatever) and prepend ^ or / at the Regexp construction.
  toRegExpSource(allowDot) {
    const dot = allowDot ?? !!this.#options.dot;
    if (this.#root === this) {
      this.#flatten();
      this.#fillNegs();
    }
    if (!isExtglobAST(this)) {
      const noEmpty = this.isStart() && this.isEnd() && !this.#parts.some((s) => typeof s !== "string");
      const src = this.#parts.map((p) => {
        const [re, _, hasMagic, uflag] = typeof p === "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
        this.#hasMagic = this.#hasMagic || hasMagic;
        this.#uflag = this.#uflag || uflag;
        return re;
      }).join("");
      let start2 = "";
      if (this.isStart()) {
        if (typeof this.#parts[0] === "string") {
          const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
          if (!dotTravAllowed) {
            const aps = addPatternStart;
            const needNoTrav = (
              // dots are allowed, and the pattern starts with [ or .
              dot && aps.has(src.charAt(0)) || // the pattern starts with \., and then [ or .
              src.startsWith("\\.") && aps.has(src.charAt(2)) || // the pattern starts with \.\., and then [ or .
              src.startsWith("\\.\\.") && aps.has(src.charAt(4))
            );
            const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
            start2 = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
          }
        }
      }
      let end = "";
      if (this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!") {
        end = "(?:$|\\/)";
      }
      const final2 = start2 + src + end;
      return [
        final2,
        unescape(src),
        this.#hasMagic = !!this.#hasMagic,
        this.#uflag
      ];
    }
    const repeated = this.type === "*" || this.type === "+";
    const start = this.type === "!" ? "(?:(?!(?:" : "(?:";
    let body = this.#partsToRegExp(dot);
    if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
      const s = this.toString();
      const me = this;
      me.#parts = [s];
      me.type = null;
      me.#hasMagic = void 0;
      return [s, unescape(this.toString()), false, false];
    }
    let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ? "" : this.#partsToRegExp(true);
    if (bodyDotAllowed === body) {
      bodyDotAllowed = "";
    }
    if (bodyDotAllowed) {
      body = `(?:${body})(?:${bodyDotAllowed})*?`;
    }
    let final = "";
    if (this.type === "!" && this.#emptyExt) {
      final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
    } else {
      const close = this.type === "!" ? (
        // !() must match something,but !(x) can match ''
        "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star + ")"
      ) : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? `)?` : `)${this.type}`;
      final = start + body + close;
    }
    return [
      final,
      unescape(body),
      this.#hasMagic = !!this.#hasMagic,
      this.#uflag
    ];
  }
  #flatten() {
    if (!isExtglobAST(this)) {
      for (const p of this.#parts) {
        if (typeof p === "object") {
          p.#flatten();
        }
      }
    } else {
      let iterations = 0;
      let done = false;
      do {
        done = true;
        for (let i = 0; i < this.#parts.length; i++) {
          const c = this.#parts[i];
          if (typeof c === "object") {
            c.#flatten();
            if (this.#canAdopt(c)) {
              done = false;
              this.#adopt(c, i);
            } else if (this.#canAdoptWithSpace(c)) {
              done = false;
              this.#adoptWithSpace(c, i);
            } else if (this.#canUsurp(c)) {
              done = false;
              this.#usurp(c);
            }
          }
        }
      } while (!done && ++iterations < 10);
    }
    this.#toString = void 0;
  }
  #partsToRegExp(dot) {
    return this.#parts.map((p) => {
      if (typeof p === "string") {
        throw new Error("string type in extglob ast??");
      }
      const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
      this.#uflag = this.#uflag || uflag;
      return re;
    }).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
  }
  static #parseGlob(glob, hasMagic, noEmpty = false) {
    let escaping = false;
    let re = "";
    let uflag = false;
    let inStar = false;
    for (let i = 0; i < glob.length; i++) {
      const c = glob.charAt(i);
      if (escaping) {
        escaping = false;
        re += (reSpecials.has(c) ? "\\" : "") + c;
        continue;
      }
      if (c === "*") {
        if (inStar)
          continue;
        inStar = true;
        re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star;
        hasMagic = true;
        continue;
      } else {
        inStar = false;
      }
      if (c === "\\") {
        if (i === glob.length - 1) {
          re += "\\\\";
        } else {
          escaping = true;
        }
        continue;
      }
      if (c === "[") {
        const [src, needUflag, consumed, magic] = parseClass(glob, i);
        if (consumed) {
          re += src;
          uflag = uflag || needUflag;
          i += consumed - 1;
          hasMagic = hasMagic || magic;
          continue;
        }
      }
      if (c === "?") {
        re += qmark;
        hasMagic = true;
        continue;
      }
      re += regExpEscape(c);
    }
    return [re, unescape(glob), !!hasMagic, uflag];
  }
};
_a = AST;

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/escape.js
var escape = (s, { windowsPathsNoEscape = false, magicalBraces = false } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/[?*()[\]{}]/g, "[$&]") : s.replace(/[?*()[\]\\{}]/g, "\\$&");
  }
  return windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");
};

// node_modules/.pnpm/minimatch@10.2.5/node_modules/minimatch/dist/esm/index.js
var minimatch = (p, pattern, options = {}) => {
  assertValidPattern(pattern);
  if (!options.nocomment && pattern.charAt(0) === "#") {
    return false;
  }
  return new Minimatch(pattern, options).match(p);
};
var starDotExtRE = /^\*+([^+@!?*[(]*)$/;
var starDotExtTest = (ext2) => (f) => !f.startsWith(".") && f.endsWith(ext2);
var starDotExtTestDot = (ext2) => (f) => f.endsWith(ext2);
var starDotExtTestNocase = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext2);
};
var starDotExtTestNocaseDot = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => f.toLowerCase().endsWith(ext2);
};
var starDotStarRE = /^\*+\.\*+$/;
var starDotStarTest = (f) => !f.startsWith(".") && f.includes(".");
var starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes(".");
var dotStarRE = /^\.\*+$/;
var dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith(".");
var starRE = /^\*+$/;
var starTest = (f) => f.length !== 0 && !f.startsWith(".");
var starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..";
var qmarksRE = /^\?+([^+@!?*[(]*)?$/;
var qmarksTestNocase = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestNocaseDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTest = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTestNoExt = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && !f.startsWith(".");
};
var qmarksTestNoExtDot = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && f !== "." && f !== "..";
};
var defaultPlatform = typeof process === "object" && process ? typeof process.env === "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var path = {
  win32: { sep: "\\" },
  posix: { sep: "/" }
};
var sep = defaultPlatform === "win32" ? path.win32.sep : path.posix.sep;
minimatch.sep = sep;
var GLOBSTAR = /* @__PURE__ */ Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
var qmark2 = "[^/]";
var star2 = qmark2 + "*?";
var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
var filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
var ext = (a, b = {}) => Object.assign({}, a, b);
var defaults = (def) => {
  if (!def || typeof def !== "object" || !Object.keys(def).length) {
    return minimatch;
  }
  const orig = minimatch;
  const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
  return Object.assign(m, {
    Minimatch: class Minimatch extends orig.Minimatch {
      constructor(pattern, options = {}) {
        super(pattern, ext(def, options));
      }
      static defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      }
    },
    AST: class AST extends orig.AST {
      /* c8 ignore start */
      constructor(type, parent, options = {}) {
        super(type, parent, ext(def, options));
      }
      /* c8 ignore stop */
      static fromGlob(pattern, options = {}) {
        return orig.AST.fromGlob(pattern, ext(def, options));
      }
    },
    unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
    escape: (s, options = {}) => orig.escape(s, ext(def, options)),
    filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
    defaults: (options) => orig.defaults(ext(def, options)),
    makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
    braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
    match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
    sep: orig.sep,
    GLOBSTAR
  });
};
minimatch.defaults = defaults;
var braceExpand = (pattern, options = {}) => {
  assertValidPattern(pattern);
  if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
    return [pattern];
  }
  return expand(pattern, { max: options.braceExpandMax });
};
minimatch.braceExpand = braceExpand;
var makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
var match = (list, pattern, options = {}) => {
  const mm = new Minimatch(pattern, options);
  list = list.filter((f) => mm.match(f));
  if (mm.options.nonull && !list.length) {
    list.push(pattern);
  }
  return list;
};
minimatch.match = match;
var globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
var regExpEscape2 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Minimatch = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(pattern, options = {}) {
    assertValidPattern(pattern);
    options = options || {};
    this.options = options;
    this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
    this.pattern = pattern;
    this.platform = options.platform || defaultPlatform;
    this.isWindows = this.platform === "win32";
    const awe = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options[awe] === false;
    if (this.windowsPathsNoEscape) {
      this.pattern = this.pattern.replace(/\\/g, "/");
    }
    this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
    this.regexp = null;
    this.negate = false;
    this.nonegate = !!options.nonegate;
    this.comment = false;
    this.empty = false;
    this.partial = !!options.partial;
    this.nocase = !!this.options.nocase;
    this.windowsNoMagicRoot = options.windowsNoMagicRoot !== void 0 ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase);
    this.globSet = [];
    this.globParts = [];
    this.set = [];
    this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) {
      return true;
    }
    for (const pattern of this.set) {
      for (const part of pattern) {
        if (typeof part !== "string")
          return true;
      }
    }
    return false;
  }
  debug(..._) {
  }
  make() {
    const pattern = this.pattern;
    const options = this.options;
    if (!options.nocomment && pattern.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!pattern) {
      this.empty = true;
      return;
    }
    this.parseNegate();
    this.globSet = [...new Set(this.braceExpand())];
    if (options.debug) {
      this.debug = (...args) => console.error(...args);
    }
    this.debug(this.pattern, this.globSet);
    const rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
    this.globParts = this.preprocess(rawGlobParts);
    this.debug(this.pattern, this.globParts);
    let set = this.globParts.map((s, _, __) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        const isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]);
        const isDrive = /^[a-z]:/i.test(s[0]);
        if (isUNC) {
          return [
            ...s.slice(0, 4),
            ...s.slice(4).map((ss) => this.parse(ss))
          ];
        } else if (isDrive) {
          return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
        }
      }
      return s.map((ss) => this.parse(ss));
    });
    this.debug(this.pattern, set);
    this.set = set.filter((s) => s.indexOf(false) === -1);
    if (this.isWindows) {
      for (let i = 0; i < this.set.length; i++) {
        const p = this.set[i];
        if (p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] === "string" && /^[a-z]:$/i.test(p[3])) {
          p[2] = "?";
        }
      }
    }
    this.debug(this.pattern, this.set);
  }
  // various transforms to equivalent pattern sets that are
  // faster to process in a filesystem walk.  The goal is to
  // eliminate what we can, and push all ** patterns as far
  // to the right as possible, even if it increases the number
  // of patterns that we have to process.
  preprocess(globParts) {
    if (this.options.noglobstar) {
      for (const partset of globParts) {
        for (let j = 0; j < partset.length; j++) {
          if (partset[j] === "**") {
            partset[j] = "*";
          }
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      globParts = this.firstPhasePreProcess(globParts);
      globParts = this.secondPhasePreProcess(globParts);
    } else if (optimizationLevel >= 1) {
      globParts = this.levelOneOptimize(globParts);
    } else {
      globParts = this.adjascentGlobstarOptimize(globParts);
    }
    return globParts;
  }
  // just get rid of adjascent ** portions
  adjascentGlobstarOptimize(globParts) {
    return globParts.map((parts) => {
      let gs = -1;
      while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
        let i = gs;
        while (parts[i + 1] === "**") {
          i++;
        }
        if (i !== gs) {
          parts.splice(gs, i - gs);
        }
      }
      return parts;
    });
  }
  // get rid of adjascent ** and resolve .. portions
  levelOneOptimize(globParts) {
    return globParts.map((parts) => {
      parts = parts.reduce((set, part) => {
        const prev = set[set.length - 1];
        if (part === "**" && prev === "**") {
          return set;
        }
        if (part === "..") {
          if (prev && prev !== ".." && prev !== "." && prev !== "**") {
            set.pop();
            return set;
          }
        }
        set.push(part);
        return set;
      }, []);
      return parts.length === 0 ? [""] : parts;
    });
  }
  levelTwoFileOptimize(parts) {
    if (!Array.isArray(parts)) {
      parts = this.slashSplit(parts);
    }
    let didSomething = false;
    do {
      didSomething = false;
      if (!this.preserveMultipleSlashes) {
        for (let i = 1; i < parts.length - 1; i++) {
          const p = parts[i];
          if (i === 1 && p === "" && parts[0] === "")
            continue;
          if (p === "." || p === "") {
            didSomething = true;
            parts.splice(i, 1);
            i--;
          }
        }
        if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
          didSomething = true;
          parts.pop();
        }
      }
      let dd = 0;
      while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
        const p = parts[dd - 1];
        if (p && p !== "." && p !== ".." && p !== "**" && !(this.isWindows && /^[a-z]:$/i.test(p))) {
          didSomething = true;
          parts.splice(dd - 1, 2);
          dd -= 2;
        }
      }
    } while (didSomething);
    return parts.length === 0 ? [""] : parts;
  }
  // First phase: single-pattern processing
  // <pre> is 1 or more portions
  // <rest> is 1 or more portions
  // <p> is any portion other than ., .., '', or **
  // <e> is . or ''
  //
  // **/.. is *brutal* for filesystem walking performance, because
  // it effectively resets the recursive walk each time it occurs,
  // and ** cannot be reduced out by a .. pattern part like a regexp
  // or most strings (other than .., ., and '') can be.
  //
  // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
  // <pre>/<e>/<rest> -> <pre>/<rest>
  // <pre>/<p>/../<rest> -> <pre>/<rest>
  // **/**/<rest> -> **/<rest>
  //
  // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
  // this WOULD be allowed if ** did follow symlinks, or * didn't
  firstPhasePreProcess(globParts) {
    let didSomething = false;
    do {
      didSomething = false;
      for (let parts of globParts) {
        let gs = -1;
        while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
          let gss = gs;
          while (parts[gss + 1] === "**") {
            gss++;
          }
          if (gss > gs) {
            parts.splice(gs + 1, gss - gs);
          }
          let next = parts[gs + 1];
          const p = parts[gs + 2];
          const p2 = parts[gs + 3];
          if (next !== "..")
            continue;
          if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") {
            continue;
          }
          didSomething = true;
          parts.splice(gs, 1);
          const other = parts.slice(0);
          other[gs] = "**";
          globParts.push(other);
          gs--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let i = 1; i < parts.length - 1; i++) {
            const p = parts[i];
            if (i === 1 && p === "" && parts[0] === "")
              continue;
            if (p === "." || p === "") {
              didSomething = true;
              parts.splice(i, 1);
              i--;
            }
          }
          if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
            didSomething = true;
            parts.pop();
          }
        }
        let dd = 0;
        while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
          const p = parts[dd - 1];
          if (p && p !== "." && p !== ".." && p !== "**") {
            didSomething = true;
            const needDot = dd === 1 && parts[dd + 1] === "**";
            const splin = needDot ? ["."] : [];
            parts.splice(dd - 1, 2, ...splin);
            if (parts.length === 0)
              parts.push("");
            dd -= 2;
          }
        }
      }
    } while (didSomething);
    return globParts;
  }
  // second phase: multi-pattern dedupes
  // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
  // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
  // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
  //
  // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
  // ^-- not valid because ** doens't follow symlinks
  secondPhasePreProcess(globParts) {
    for (let i = 0; i < globParts.length - 1; i++) {
      for (let j = i + 1; j < globParts.length; j++) {
        const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
        if (matched) {
          globParts[i] = [];
          globParts[j] = matched;
          break;
        }
      }
    }
    return globParts.filter((gs) => gs.length);
  }
  partsMatch(a, b, emptyGSMatch = false) {
    let ai = 0;
    let bi = 0;
    let result = [];
    let which = "";
    while (ai < a.length && bi < b.length) {
      if (a[ai] === b[bi]) {
        result.push(which === "b" ? b[bi] : a[ai]);
        ai++;
        bi++;
      } else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1]) {
        result.push(a[ai]);
        ai++;
      } else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1]) {
        result.push(b[bi]);
        bi++;
      } else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
        if (which === "b")
          return false;
        which = "a";
        result.push(a[ai]);
        ai++;
        bi++;
      } else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
        if (which === "a")
          return false;
        which = "b";
        result.push(b[bi]);
        ai++;
        bi++;
      } else {
        return false;
      }
    }
    return a.length === b.length && result;
  }
  parseNegate() {
    if (this.nonegate)
      return;
    const pattern = this.pattern;
    let negate = false;
    let negateOffset = 0;
    for (let i = 0; i < pattern.length && pattern.charAt(i) === "!"; i++) {
      negate = !negate;
      negateOffset++;
    }
    if (negateOffset)
      this.pattern = pattern.slice(negateOffset);
    this.negate = negate;
  }
  // set partial to true to test if, for example,
  // "/a/b" matches the start of "/*/b/*/d"
  // Partial means, if you run out of file before you run
  // out of pattern, then that's fine, as long as all
  // the parts match.
  matchOne(file, pattern, partial = false) {
    let fileStartIndex = 0;
    let patternStartIndex = 0;
    if (this.isWindows) {
      const fileDrive = typeof file[0] === "string" && /^[a-z]:$/i.test(file[0]);
      const fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]);
      const patternDrive = typeof pattern[0] === "string" && /^[a-z]:$/i.test(pattern[0]);
      const patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] === "string" && /^[a-z]:$/i.test(pattern[3]);
      const fdi = fileUNC ? 3 : fileDrive ? 0 : void 0;
      const pdi = patternUNC ? 3 : patternDrive ? 0 : void 0;
      if (typeof fdi === "number" && typeof pdi === "number") {
        const [fd, pd] = [
          file[fdi],
          pattern[pdi]
        ];
        if (fd.toLowerCase() === pd.toLowerCase()) {
          pattern[pdi] = fd;
          patternStartIndex = pdi;
          fileStartIndex = fdi;
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      file = this.levelTwoFileOptimize(file);
    }
    if (pattern.includes(GLOBSTAR)) {
      return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
    }
    return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
  }
  #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
    const firstgs = pattern.indexOf(GLOBSTAR, patternIndex);
    const lastgs = pattern.lastIndexOf(GLOBSTAR);
    const [head, body, tail] = partial ? [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1),
      []
    ] : [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1, lastgs),
      pattern.slice(lastgs + 1)
    ];
    if (head.length) {
      const fileHead = file.slice(fileIndex, fileIndex + head.length);
      if (!this.#matchOne(fileHead, head, partial, 0, 0)) {
        return false;
      }
      fileIndex += head.length;
      patternIndex += head.length;
    }
    let fileTailMatch = 0;
    if (tail.length) {
      if (tail.length + fileIndex > file.length)
        return false;
      let tailStart = file.length - tail.length;
      if (this.#matchOne(file, tail, partial, tailStart, 0)) {
        fileTailMatch = tail.length;
      } else {
        if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
          return false;
        }
        tailStart--;
        if (!this.#matchOne(file, tail, partial, tailStart, 0)) {
          return false;
        }
        fileTailMatch = tail.length + 1;
      }
    }
    if (!body.length) {
      let sawSome = !!fileTailMatch;
      for (let i2 = fileIndex; i2 < file.length - fileTailMatch; i2++) {
        const f = String(file[i2]);
        sawSome = true;
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return partial || sawSome;
    }
    const bodySegments = [[[], 0]];
    let currentBody = bodySegments[0];
    let nonGsParts = 0;
    const nonGsPartsSums = [0];
    for (const b of body) {
      if (b === GLOBSTAR) {
        nonGsPartsSums.push(nonGsParts);
        currentBody = [[], 0];
        bodySegments.push(currentBody);
      } else {
        currentBody[0].push(b);
        nonGsParts++;
      }
    }
    let i = bodySegments.length - 1;
    const fileLength = file.length - fileTailMatch;
    for (const b of bodySegments) {
      b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
    }
    return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
  }
  // return false for "nope, not matching"
  // return null for "not matching, cannot keep trying"
  #matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
    const bs = bodySegments[bodyIndex];
    if (!bs) {
      for (let i = fileIndex; i < file.length; i++) {
        sawTail = true;
        const f = file[i];
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return sawTail;
    }
    const [body, after] = bs;
    while (fileIndex <= after) {
      const m = this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
      if (m && globStarDepth < this.maxGlobstarRecursion) {
        const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
        if (sub !== false) {
          return sub;
        }
      }
      const f = file[fileIndex];
      if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
        return false;
      }
      fileIndex++;
    }
    return partial || null;
  }
  #matchOne(file, pattern, partial, fileIndex, patternIndex) {
    let fi;
    let pi;
    let pl;
    let fl;
    for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
      this.debug("matchOne loop");
      let p = pattern[pi];
      let f = file[fi];
      this.debug(pattern, p, f);
      if (p === false || p === GLOBSTAR) {
        return false;
      }
      let hit;
      if (typeof p === "string") {
        hit = f === p;
        this.debug("string match", p, f, hit);
      } else {
        hit = p.test(f);
        this.debug("pattern match", p, f, hit);
      }
      if (!hit)
        return false;
    }
    if (fi === fl && pi === pl) {
      return true;
    } else if (fi === fl) {
      return partial;
    } else if (pi === pl) {
      return fi === fl - 1 && file[fi] === "";
    } else {
      throw new Error("wtf?");
    }
  }
  braceExpand() {
    return braceExpand(this.pattern, this.options);
  }
  parse(pattern) {
    assertValidPattern(pattern);
    const options = this.options;
    if (pattern === "**")
      return GLOBSTAR;
    if (pattern === "")
      return "";
    let m;
    let fastTest = null;
    if (m = pattern.match(starRE)) {
      fastTest = options.dot ? starTestDot : starTest;
    } else if (m = pattern.match(starDotExtRE)) {
      fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]);
    } else if (m = pattern.match(qmarksRE)) {
      fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m);
    } else if (m = pattern.match(starDotStarRE)) {
      fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
    } else if (m = pattern.match(dotStarRE)) {
      fastTest = dotStarTest;
    }
    const re = AST.fromGlob(pattern, this.options).toMMPattern();
    if (fastTest && typeof re === "object") {
      Reflect.defineProperty(re, "test", { value: fastTest });
    }
    return re;
  }
  makeRe() {
    if (this.regexp || this.regexp === false)
      return this.regexp;
    const set = this.set;
    if (!set.length) {
      this.regexp = false;
      return this.regexp;
    }
    const options = this.options;
    const twoStar = options.noglobstar ? star2 : options.dot ? twoStarDot : twoStarNoDot;
    const flags = new Set(options.nocase ? ["i"] : []);
    let re = set.map((pattern) => {
      const pp = pattern.map((p) => {
        if (p instanceof RegExp) {
          for (const f of p.flags.split(""))
            flags.add(f);
        }
        return typeof p === "string" ? regExpEscape2(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
      });
      pp.forEach((p, i) => {
        const next = pp[i + 1];
        const prev = pp[i - 1];
        if (p !== GLOBSTAR || prev === GLOBSTAR) {
          return;
        }
        if (prev === void 0) {
          if (next !== void 0 && next !== GLOBSTAR) {
            pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next;
          } else {
            pp[i] = twoStar;
          }
        } else if (next === void 0) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + ")?";
        } else if (next !== GLOBSTAR) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next;
          pp[i + 1] = GLOBSTAR;
        }
      });
      const filtered = pp.filter((p) => p !== GLOBSTAR);
      if (this.partial && filtered.length >= 1) {
        const prefixes = [];
        for (let i = 1; i <= filtered.length; i++) {
          prefixes.push(filtered.slice(0, i).join("/"));
        }
        return "(?:" + prefixes.join("|") + ")";
      }
      return filtered.join("/");
    }).join("|");
    const [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
    re = "^" + open + re + close + "$";
    if (this.partial) {
      re = "^(?:\\/|" + open + re.slice(1, -1) + close + ")$";
    }
    if (this.negate)
      re = "^(?!" + re + ").+$";
    try {
      this.regexp = new RegExp(re, [...flags].join(""));
    } catch {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(p) {
    if (this.preserveMultipleSlashes) {
      return p.split("/");
    } else if (this.isWindows && /^\/\/[^/]+/.test(p)) {
      return ["", ...p.split(/\/+/)];
    } else {
      return p.split(/\/+/);
    }
  }
  match(f, partial = this.partial) {
    this.debug("match", f, this.pattern);
    if (this.comment) {
      return false;
    }
    if (this.empty) {
      return f === "";
    }
    if (f === "/" && partial) {
      return true;
    }
    const options = this.options;
    if (this.isWindows) {
      f = f.split("\\").join("/");
    }
    const ff = this.slashSplit(f);
    this.debug(this.pattern, "split", ff);
    const set = this.set;
    this.debug(this.pattern, "set", set);
    let filename = ff[ff.length - 1];
    if (!filename) {
      for (let i = ff.length - 2; !filename && i >= 0; i--) {
        filename = ff[i];
      }
    }
    for (const pattern of set) {
      let file = ff;
      if (options.matchBase && pattern.length === 1) {
        file = [filename];
      }
      const hit = this.matchOne(file, pattern, partial);
      if (hit) {
        if (options.flipNegate) {
          return true;
        }
        return !this.negate;
      }
    }
    if (options.flipNegate) {
      return false;
    }
    return this.negate;
  }
  static defaults(def) {
    return minimatch.defaults(def).Minimatch;
  }
};
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;

// lib/ignore.mjs
var DEFAULT_IGNORE_DIRS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.anchor/**"
];
function normalize(relPath) {
  return relPath.startsWith("./") ? relPath.slice(2) : relPath;
}
function isIgnored(relPath, patterns = []) {
  return patterns.some((p) => minimatch(normalize(relPath), p, { dot: true }));
}
function filterIgnored(paths, patterns = []) {
  if (patterns.length === 0) return paths;
  const matchers = patterns.map((p) => new Minimatch(p, { dot: true }));
  return paths.filter((p) => !matchers.some((m) => m.match(normalize(p))));
}
function isValidGlob(glob) {
  try {
    new Minimatch(glob, { dot: true });
    return true;
  } catch {
    return false;
  }
}
function matchesScope(scope, changedPaths) {
  let mm;
  try {
    mm = new Minimatch(scope ?? "**", { dot: true });
  } catch {
    return false;
  }
  return changedPaths.some((p) => mm.match(normalize(String(p))));
}

// lib/config.mjs
var DEFAULTS = {
  ignore: ["**/*.lock", "**/*.generated.*", "vendor/**", "node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"],
  min_severity: "low",
  strictness: 2,
  max_findings: 50,
  categories: ["logic", "security", "perf", "style", "docs", "tests"],
  protected_categories: ["security", "data-loss", "crash", "injection", "auth"],
  rules: [],
  min_confidence: 2,
  max_diff_lines: 15e3,
  max_files: 100,
  output: { show_whats_good: true, show_diff_stats: true, color: "auto" }
};
var SEVERITIES = ["critical", "high", "medium", "low"];
var CATEGORIES = ["logic", "security", "perf", "style", "docs", "tests"];
var COLORS = ["auto", "always", "never"];
var BOUNDS = { max_findings: [1, Infinity], min_confidence: [0, 5], max_diff_lines: [1, Infinity], max_files: [1, Infinity] };
function loadConfig(repoDir) {
  const warnings = [];
  const file = join(repoDir, ".anchor", "config.yaml");
  let raw = {};
  if (existsSync(file)) {
    try {
      raw = index_vite_proxy_tmp_default.load(readFileSync(file, "utf8")) ?? {};
      if (typeof raw !== "object" || Array.isArray(raw)) raw = {};
    } catch (e) {
      const line = e?.mark ? ` at line ${e.mark.line + 1}` : "";
      warnings.push(`anchor: .anchor/config.yaml is invalid YAML${line}. Using defaults.`);
      raw = {};
    }
  }
  if (raw.strictness !== void 0 && ![1, 2, 3].includes(raw.strictness)) {
    warnings.push(
      `anchor: strictness must be 1, 2, or 3. Got ${JSON.stringify(raw.strictness)}. Using 2 (balanced).`
    );
    delete raw.strictness;
  }
  if (raw.ignore !== void 0 && !Array.isArray(raw.ignore)) {
    warnings.push(`anchor: ignore must be a list. Got ${JSON.stringify(raw.ignore)}. Using defaults.`);
    delete raw.ignore;
  }
  if (raw.categories !== void 0 && !Array.isArray(raw.categories)) {
    warnings.push(`anchor: categories must be a list. Got ${JSON.stringify(raw.categories)}. Using defaults.`);
    delete raw.categories;
  }
  for (const key of ["max_findings", "min_confidence", "max_diff_lines", "max_files"]) {
    if (raw[key] !== void 0 && !Number.isInteger(raw[key])) {
      warnings.push(`anchor: ${key} must be an integer. Got ${JSON.stringify(raw[key])}. Using ${DEFAULTS[key]}.`);
      delete raw[key];
    }
  }
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    if (Number.isInteger(raw[key]) && (raw[key] < lo || raw[key] > hi)) {
      warnings.push(`anchor: ${key} must be between ${lo} and ${hi}. Got ${raw[key]}. Using ${DEFAULTS[key]}.`);
      delete raw[key];
    }
  }
  if (raw.min_severity !== void 0 && !SEVERITIES.includes(raw.min_severity)) {
    warnings.push(`anchor: min_severity must be one of ${SEVERITIES.join(", ")}. Got ${JSON.stringify(raw.min_severity)}. Using low.`);
    delete raw.min_severity;
  }
  if (Array.isArray(raw.categories)) {
    const bad = raw.categories.filter((c) => !CATEGORIES.includes(c));
    if (bad.length) {
      warnings.push(`anchor: unknown categories ${JSON.stringify(bad)}. Allowed: ${CATEGORIES.join(", ")}. Dropping them.`);
      raw.categories = raw.categories.filter((c) => CATEGORIES.includes(c));
      if (raw.categories.length === 0) {
        warnings.push("anchor: all categories were invalid. Using defaults (all).");
        delete raw.categories;
      }
    }
  }
  if (raw.output !== void 0 && (typeof raw.output !== "object" || Array.isArray(raw.output))) {
    warnings.push(`anchor: output must be a mapping. Got ${JSON.stringify(raw.output)}. Using defaults.`);
    delete raw.output;
  }
  if (raw.output && raw.output.color !== void 0 && !COLORS.includes(raw.output.color)) {
    warnings.push(`anchor: output.color must be one of ${COLORS.join(", ")}. Got ${JSON.stringify(raw.output.color)}. Using auto.`);
    delete raw.output.color;
  }
  if (raw.protected_categories !== void 0 && !Array.isArray(raw.protected_categories)) {
    warnings.push(`anchor: protected_categories must be a list. Got ${JSON.stringify(raw.protected_categories)}. Using defaults.`);
    delete raw.protected_categories;
  }
  if (raw.rules !== void 0) {
    if (!Array.isArray(raw.rules)) {
      warnings.push(`anchor: rules must be a list. Got ${JSON.stringify(raw.rules)}. Ignoring.`);
      delete raw.rules;
    } else {
      raw.rules = raw.rules.filter((r) => {
        if (!r || typeof r.rule !== "string") {
          warnings.push(`anchor: each rule needs a string "rule". Dropping ${JSON.stringify(r)}.`);
          return false;
        }
        if (r.scope !== void 0 && !isValidGlob(r.scope)) {
          warnings.push(`anchor: rule ${JSON.stringify(r.id ?? r.rule)} has an invalid scope glob ${JSON.stringify(r.scope)}. Dropping it.`);
          return false;
        }
        return true;
      });
    }
  }
  const config = {
    ...DEFAULTS,
    ...raw,
    ignore: Array.isArray(raw.ignore) ? raw.ignore : [...DEFAULTS.ignore],
    categories: Array.isArray(raw.categories) ? raw.categories : [...DEFAULTS.categories],
    protected_categories: Array.isArray(raw.protected_categories) ? raw.protected_categories : [...DEFAULTS.protected_categories],
    rules: Array.isArray(raw.rules) ? raw.rules : [...DEFAULTS.rules],
    output: { ...DEFAULTS.output, ...raw.output ?? {} }
  };
  return { config, warnings };
}
var GITIGNORE_BLOCK = [
  "# Anchor (personal code review state)",
  ".anchor/config.yaml",
  ".anchor/codebase-map.md",
  ".anchor/codebase-graph.md",
  ".anchor/learnings.md",
  ".anchor/reviews/"
];
function ensureGitignore(repoDir) {
  const file = join(repoDir, ".gitignore");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = GITIGNORE_BLOCK.filter((l) => !lines.has(l));
  if (missing.length === 0) return { added: false };
  const sep3 = existing.length && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(file, `${sep3}${missing.join("\n")}
`);
  return { added: true };
}

// lib/doctor.mjs
function runDoctor({ cwd = process.cwd() } = {}) {
  const checks = [];
  const add = (name, ok2, message, opts = {}) => {
    const { level = "error", fix } = opts;
    checks.push({ name, ok: ok2, level, message, ...ok2 ? {} : { fix } });
  };
  const gitV = runGit(["--version"]);
  const gitMajor = Number(/git version (\d+)/.exec(gitV.stdout)?.[1] ?? 0);
  const gitOk = gitV.code === 0 && gitMajor >= 2;
  add("git", gitOk, gitOk ? gitV.stdout.trim() : "git not found or too old", {
    fix: "Install git >= 2.0"
  });
  const ghV = runCmd("gh", ["--version"]);
  add("gh", ghV.code === 0, ghV.code === 0 ? ghV.stdout.split("\n")[0] : "gh not found (only required for PR mode)", {
    level: "warn",
    fix: "Install from https://cli.github.com"
  });
  const inRepo = isGitRepo(cwd);
  add("repo", inRepo, inRepo ? "inside a git repository" : "not a git repository", {
    fix: "Run from inside a repo"
  });
  const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
  const underPluginCache = pkgRoot.includes(join2(".claude", "plugins", "cache"));
  const bundlePath = join2(pkgRoot, "dist", "anchor.mjs");
  const bundleOk = existsSync2(bundlePath);
  add("bundle", bundleOk, bundleOk ? `${bundlePath} present` : `${bundlePath} missing`, {
    level: underPluginCache ? "error" : "warn",
    // missing bundle in a plugin install = broken release
    fix: "Run /plugin update anchor (or `make bundle` in a dev checkout)"
  });
  add(
    "plugin install",
    underPluginCache,
    underPluginCache ? `running from plugin cache (${pkgRoot})` : `running from source checkout (dev mode): ${pkgRoot}`,
    { level: "warn", fix: "Install via /plugin install anchor@mjenkins-toolbox for normal use" }
  );
  const { warnings } = loadConfig(cwd);
  add("config", warnings.length === 0, warnings.length === 0 ? ".anchor/config.yaml ok (or absent)" : warnings.join("; "), {
    level: "warn",
    fix: "Fix .anchor/config.yaml"
  });
  const inClaude = process.env.CLAUDECODE === "1";
  add("claude code", inClaude, inClaude ? "session active" : "no active Claude Code session detected", {
    level: "warn",
    fix: "Run inside Claude Code for review workflows"
  });
  const major = Number(process.version.slice(1).split(".")[0]);
  add("node", major >= 18, `node ${process.version}`, { fix: "Install Node 18+" });
  const ok = checks.every((c) => c.ok || c.level === "warn");
  return { ok, checks };
}

// lib/diff.mjs
import { readFileSync as readFileSync2, existsSync as existsSync3 } from "node:fs";
import { join as join3 } from "node:path";
function sinceLastRange(repoDir, lastSha, { env } = {}) {
  if (!lastSha) return { mode: "fallback", reason: "no prior review to diff since" };
  const verify = runGit(["rev-parse", "--verify", "--quiet", `${lastSha}^{commit}`], { cwd: repoDir, env });
  if (verify.code !== 0) {
    return { mode: "fallback", reason: `prior review SHA ${lastSha} is unreachable (rebased or pruned?)` };
  }
  const anc = runGit(["merge-base", "--is-ancestor", lastSha, "HEAD"], { cwd: repoDir, env });
  if (anc.code !== 0) {
    return { mode: "fallback", reason: `prior review SHA ${lastSha} is not an ancestor of HEAD (rebased?)` };
  }
  return { mode: "range", range: `${lastSha}..HEAD` };
}
function parseTarget(tokens = []) {
  const t = tokens.filter((x) => !x.startsWith("--"));
  if (t.length === 0) return { mode: "uncommitted" };
  if (t[0] === "uncommitted") return { mode: "uncommitted" };
  if (t[0] === "staged") return { mode: "staged" };
  if (t[0] === "pr") {
    const selector = t[1] ?? "";
    if (!selector) throw new Error("anchor: pr mode needs a number or URL, e.g. `anchor diff pr 123`");
    return { mode: "pr", selector };
  }
  if (t[0].startsWith("@")) return { mode: "file", path: t[0].slice(1) };
  if (t[0].includes("..")) {
    const [ref1, ref2] = t[0].split(/\.{2,3}/);
    return { mode: "ref-diff", ref1, ref2, range: t[0] };
  }
  throw new Error(`anchor: unrecognized target "${t[0]}"`);
}
function parseUnifiedDiff(text) {
  const files = [];
  let file = null;
  let pending = null;
  let oldPath = null;
  let hunk = null;
  let remOld = 0;
  let remNew = 0;
  const flush = () => {
    if (pending && !file) {
      files.push({ path: pending.newGit, added: 0, removed: 0, hunks: [], ...pending.flags });
    }
    pending = null;
    file = null;
    oldPath = null;
    hunk = null;
    remOld = remNew = 0;
  };
  for (const line of text.split("\n")) {
    if (hunk && (remOld > 0 || remNew > 0) && !line.startsWith("diff --git ")) {
      if (line.startsWith("\\")) continue;
      hunk.body += line + "\n";
      const c = line[0];
      if (c === "+") {
        remNew--;
        file.added++;
      } else if (c === "-") {
        remOld--;
        file.removed++;
      } else {
        remOld--;
        remNew--;
      }
      continue;
    }
    const dg = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (dg) {
      flush();
      pending = { oldGit: dg[1], newGit: dg[2], flags: {} };
      continue;
    }
    if (pending) {
      if (line.startsWith("Binary files ")) pending.flags.binary = true;
      else if (line.startsWith("rename from ")) pending.flags.renamedFrom = line.slice("rename from ".length);
      else if (line.startsWith("old mode ")) pending.flags.modeChange = true;
    }
    if (line.startsWith("--- ")) {
      oldPath = line.slice(4).replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const newPath = line.slice(4).replace(/^b\//, "");
      file = {
        path: newPath === "/dev/null" ? oldPath : newPath,
        added: 0,
        removed: 0,
        hunks: [],
        ...pending?.flags ?? {}
      };
      files.push(file);
      pending = null;
      oldPath = null;
      hunk = null;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file) {
      hunk = {
        oldStart: Number(m[1]),
        oldLines: m[2] === void 0 ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === void 0 ? 1 : Number(m[4]),
        body: ""
      };
      remOld = hunk.oldLines;
      remNew = hunk.newLines;
      file.hunks.push(hunk);
    }
  }
  flush();
  return files;
}
function applyBudget(result, { maxLines, maxFiles, force = false, fallbackLines = 15e3, fallbackFiles = 100 }) {
  const lines = Number.isFinite(maxLines) ? maxLines : fallbackLines;
  const files = Number.isFinite(maxFiles) ? maxFiles : fallbackFiles;
  const totalLines = result.files.reduce((s, f) => s + f.added + f.removed, 0);
  const reasons = [];
  if (totalLines > lines) {
    reasons.push(`${totalLines.toLocaleString()} change-lines (budget ${lines.toLocaleString()})`);
  }
  if (result.files.length > files) {
    reasons.push(`${result.files.length.toLocaleString()} files (budget ${files.toLocaleString()})`);
  }
  if (force || reasons.length === 0) return result;
  return {
    ...result,
    overBudget: true,
    budgetWarning: `anchor: diff exceeds budget \u2014 ${reasons.join("; ")}. Reviewing anyway; prioritize the most important files. Use --force to silence, --max-diff-lines N to raise the budget, or split the change.`
  };
}
function withStats(result) {
  const stats = result.files.reduce(
    (s, f) => ({
      totalAdded: s.totalAdded + f.added,
      totalRemoved: s.totalRemoved + f.removed,
      fileCount: s.fileCount + 1
    }),
    { totalAdded: 0, totalRemoved: 0, fileCount: 0 }
  );
  return { ...result, stats };
}
function getDiff(tokens, { cwd = process.cwd(), env } = {}) {
  const staged = tokens.includes("--staged");
  const target = staged ? { mode: "staged" } : parseTarget(tokens);
  if (target.mode === "file") return fileMode(target, cwd);
  if (target.mode === "pr") return prMode(target, cwd, env);
  if (target.mode === "uncommitted" && runGit(["rev-parse", "--verify", "HEAD"], { cwd, env }).code !== 0) {
    throw new Error("anchor: no commits yet in this repository (nothing to diff against HEAD). Stage files and use --staged.");
  }
  let raw;
  if (target.mode === "uncommitted") {
    const untracked = runGit(["ls-files", "--others", "--exclude-standard"], { cwd, env }).stdout.split("\n").filter(Boolean);
    if (untracked.length > 0) runGit(["add", "-N", "--", ...untracked], { cwd, env });
    try {
      raw = runGit(["diff", "HEAD"], { cwd, env });
    } finally {
      if (untracked.length > 0) runGit(["restore", "--staged", "--", ...untracked], { cwd, env });
    }
  } else if (target.mode === "staged") raw = runGit(["diff", "--cached"], { cwd, env });
  else raw = runGit(["diff", target.range], { cwd, env });
  if (raw.code !== 0) throw new Error(`anchor: git diff failed: ${raw.stderr.trim()}`);
  return withStats({
    mode: target.mode,
    ...target.ref1 ? { ref1: target.ref1, ref2: target.ref2 } : {},
    files: parseUnifiedDiff(raw.stdout)
  });
}
function fileMode(target, cwd) {
  const abs = join3(cwd, target.path);
  if (!existsSync3(abs)) throw new Error(`anchor: file not found: ${target.path}`);
  const body = readFileSync2(abs, "utf8");
  const n = body === "" ? 0 : body.endsWith("\n") ? body.split("\n").length - 1 : body.split("\n").length;
  return withStats({
    mode: "file",
    files: [{
      path: target.path,
      added: n,
      removed: 0,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: n, body }]
    }]
  });
}
function prMode(target, cwd, env) {
  if (runCmd("gh", ["--version"], { env }).code !== 0) {
    throw new Error("anchor: PR mode requires the `gh` CLI. Install from https://cli.github.com.");
  }
  const view = runCmd(
    "gh",
    ["pr", "view", target.selector, "--json", "number,url"],
    { cwd, env, timeout: 12e4 }
    // large PRs can be slow; override the 30s default
  );
  if (view.code !== 0) {
    if (/not logged in|authentication required|no credentials|gh auth login/i.test(view.stderr)) {
      throw new Error("anchor: `gh` is not authenticated. Run `gh auth login` first.");
    }
    throw new Error(`anchor: gh pr view failed: ${view.stderr.trim()}`);
  }
  let meta;
  try {
    meta = JSON.parse(view.stdout);
  } catch {
    throw new Error(`anchor: gh pr view returned unexpected output: ${view.stdout.trim().slice(0, 120)}`);
  }
  const diff = runCmd("gh", ["pr", "diff", target.selector], { cwd, env, timeout: 12e4 });
  if (diff.code !== 0) throw new Error(`anchor: gh pr diff failed: ${diff.stderr.trim()}`);
  return withStats({
    mode: "pr",
    prNumber: String(meta.number),
    prUrl: meta.url,
    files: parseUnifiedDiff(diff.stdout)
  });
}

// lib/context.mjs
import { readFileSync as readFileSync4, existsSync as existsSync5, statSync, readdirSync } from "node:fs";
import { join as join5, dirname, basename, extname, normalize as normalize2 } from "node:path";

// lib/manifest.mjs
import { readFileSync as readFileSync3, existsSync as existsSync4 } from "node:fs";
import { join as join4 } from "node:path";
function selectManifest(entries, changedPaths) {
  return (entries ?? []).filter((e) => matchesScope(e.scope, changedPaths));
}
function loadManifest(repoDir) {
  const f = join4(repoDir, ".anchor", "files.json");
  if (!existsSync4(f)) return [];
  let raw;
  try {
    raw = JSON.parse(readFileSync3(f, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e.path === "string").map((e) => ({ path: e.path, description: typeof e.description === "string" ? e.description : "", scope: typeof e.scope === "string" ? e.scope : "**" }));
}

// lib/context.mjs
var IMPORT_RE = /(?:import\s[^'"]*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
var RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.js", ".py"];
var GREP_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.py"];
function parseImports(src) {
  const specs = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec && !specs.includes(spec)) specs.push(spec);
  }
  return specs;
}
function resolveImport(repoDir, fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = normalize2(join5(dirname(fromFile), spec));
  if (base.startsWith("..")) return null;
  for (const ext2 of RESOLVE_EXTS) {
    const candidate = base + ext2;
    const abs = join5(repoDir, candidate);
    try {
      if (statSync(abs).isFile()) return candidate;
    } catch {
    }
  }
  return null;
}
function getContext({ files, repoDir, maxFiles = 50, ignore = [] }) {
  const related = /* @__PURE__ */ new Map();
  const descriptions = /* @__PURE__ */ new Map();
  const changed = new Set(files);
  for (const f of files) {
    const stem = basename(f, extname(f));
    if (stem) {
      const grep = runGit(
        ["grep", "-lE", `(import|from|require).*${escapeRe(stem)}`, "--", ...GREP_GLOBS],
        { cwd: repoDir }
      );
      for (const p of grep.stdout.split("\n").filter(Boolean)) {
        if (!changed.has(p) && !related.has(p)) related.set(p, "importer");
      }
    }
    const abs = join5(repoDir, f);
    if (existsSync5(abs)) {
      for (const spec of parseImports(readFileSync4(abs, "utf8"))) {
        const resolved = resolveImport(repoDir, f, spec);
        if (resolved && !changed.has(resolved) && !related.has(resolved)) {
          related.set(resolved, "importee");
        }
      }
    }
  }
  for (const entry of selectManifest(loadManifest(repoDir), files)) {
    const p = entry.path.replace(/^\.\//, "");
    if (changed.has(p) || related.has(p) || !existsSync5(join5(repoDir, p))) continue;
    related.set(p, "manifest");
    if (entry.description) descriptions.set(p, entry.description);
  }
  const list = filterIgnored([...related.keys()], ignore).slice(0, maxFiles).map((path2) => {
    const reason = related.get(path2);
    const description = descriptions.get(path2);
    return description ? { path: path2, reason, description } : { path: path2, reason };
  });
  return { files: list };
}

// lib/learn.mjs
import { readFileSync as readFileSync5, writeFileSync, existsSync as existsSync6, mkdirSync } from "node:fs";
import { join as join6, dirname as dirname2 } from "node:path";
var HEADER = `# Anchor Learnings

<!--
This file is auto-managed by Anchor. Each entry is a "noise pattern" the
user has marked as not worth surfacing in future reviews.

Hand-edits are supported ONLY in this exact shape \u2014 one "### Heading" line,
optionally followed by one reason comment line (the format addLearning writes).
Anything else (body paragraphs, extra markdown) is discarded on the next rewrite.
Manage entries with \`anchor learn add|remove\` to be safe.
-->
`;
function filePath(repoDir) {
  return join6(repoDir, ".anchor", "learnings.md");
}
function sanitize(text) {
  return text.replace(/\s+/g, " ").replace(/-->/g, "\u2192").trim();
}
function parse(text) {
  const patterns = [];
  const re = /^### (.+)\n(?:<!-- reason: (.*?) -->\n?)?(?:<!-- meta: (\{.*?\}) -->\n?)?/gm;
  for (const m of text.matchAll(re)) {
    let meta = {};
    if (m[3]) {
      try {
        meta = JSON.parse(m[3]) ?? {};
      } catch {
        meta = {};
      }
    }
    patterns.push({
      heading: m[1].trim(),
      reason: m[2]?.trim() ?? null,
      scope: typeof meta.scope === "string" && meta.scope ? meta.scope : "**",
      category: typeof meta.category === "string" ? meta.category : null,
      action: typeof meta.action === "string" && meta.action ? meta.action : "suppress"
    });
  }
  return patterns;
}
function metaLine(p) {
  const meta = {};
  if (p.scope && p.scope !== "**") meta.scope = p.scope;
  if (p.category) meta.category = p.category;
  if (p.action && p.action !== "suppress") meta.action = p.action;
  return Object.keys(meta).length ? `<!-- meta: ${JSON.stringify(meta)} -->
` : "";
}
function serialize(patterns) {
  const body = patterns.map((p) => `### ${p.heading}
${p.reason ? `<!-- reason: ${p.reason} -->
` : ""}${metaLine(p)}`).join("\n");
  return `${HEADER}
${body}`;
}
function selectLearnings(patterns, changedPaths) {
  return (patterns ?? []).filter((p) => matchesScope(p.scope, changedPaths));
}
function listLearnings(repoDir) {
  const f = filePath(repoDir);
  if (!existsSync6(f)) return { patterns: [] };
  return { patterns: parse(readFileSync5(f, "utf8")) };
}
function addLearning(repoDir, pattern, reason, meta = {}) {
  const heading = sanitize(pattern ?? "");
  if (!heading) throw new Error("anchor: pattern cannot be empty");
  const { patterns } = listLearnings(repoDir);
  if (patterns.some((p) => p.heading.toLowerCase() === heading.toLowerCase())) {
    return { added: false, deduped: true };
  }
  patterns.push({
    heading,
    reason: reason ? sanitize(reason) || null : null,
    scope: typeof meta.scope === "string" && meta.scope ? meta.scope : "**",
    category: typeof meta.category === "string" && meta.category ? meta.category : null,
    action: typeof meta.action === "string" && meta.action ? meta.action : "suppress"
  });
  mkdirSync(dirname2(filePath(repoDir)), { recursive: true });
  writeFileSync(filePath(repoDir), serialize(patterns));
  return { added: true, deduped: false };
}
function removeLearning(repoDir, substring) {
  const needle = (substring ?? "").trim().toLowerCase();
  if (!needle) throw new Error("anchor: search term cannot be empty");
  const { patterns } = listLearnings(repoDir);
  const kept = patterns.filter((p) => !p.heading.toLowerCase().includes(needle));
  const removed = patterns.length - kept.length;
  if (removed > 0) writeFileSync(filePath(repoDir), serialize(kept));
  return { removed };
}

// lib/analyzers.mjs
import { extname as extname2, join as join7, isAbsolute, relative, sep as sep2 } from "node:path";
import { existsSync as existsSync7 } from "node:fs";
var MAX_FINDINGS = 200;
function resolveBin(repoDir, bin) {
  for (const name of [bin, `${bin}.cmd`]) {
    const local = join7(repoDir, "node_modules", ".bin", name);
    if (existsSync7(local)) return local;
  }
  return hasCmd(bin) ? bin : null;
}
var ANALYZERS = [
  {
    name: "tsc",
    bin: "tsc",
    exts: [".ts", ".tsx"],
    command: () => ["--noEmit", "--pretty", "false"],
    parse: (stdout, stderr) => {
      const out = `${stdout}
${stderr}`;
      const re = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm;
      const findings = [];
      let m;
      while ((m = re.exec(out)) !== null) {
        findings.push({
          rule: m[3],
          file: m[1],
          line: Number(m[2]),
          severity: "high",
          message: m[4]
        });
      }
      return findings;
    }
  },
  {
    name: "eslint",
    bin: "eslint",
    exts: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    command: (files) => ["--format", "json", ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).flatMap(
          (f) => f.messages.map((m) => ({
            rule: m.ruleId ?? "eslint",
            file: f.filePath,
            line: m.line,
            severity: m.severity === 2 ? "high" : "medium",
            message: m.message
          }))
        );
      } catch {
        return [];
      }
    }
  },
  {
    name: "ruff",
    bin: "ruff",
    exts: [".py"],
    command: (files) => ["check", "--output-format", "json", ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).map((d) => ({
          rule: d.code,
          file: d.filename,
          line: d.location?.row,
          severity: "medium",
          message: d.message
        }));
      } catch {
        return [];
      }
    }
  },
  {
    name: "shellcheck",
    bin: "shellcheck",
    exts: [".sh", ".bash"],
    command: (files) => ["--format", "json", ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).map((d) => ({
          rule: `SC${d.code}`,
          file: d.file,
          line: d.line,
          severity: d.level === "error" ? "high" : "medium",
          message: d.message
        }));
      } catch {
        return [];
      }
    }
  }
];
function selectAnalyzers(registry, files) {
  const exts = new Set(files.map((f) => extname2(f)));
  return registry.filter((a) => a.exts.some((e) => exts.has(e)));
}
async function runAnalyzers(registry, { repoDir, files, exec = void 0, resolve = resolveBin }) {
  const run = exec ?? ((bin, args) => Promise.resolve(runCmd(bin, args, { cwd: repoDir, defaultTimeout: 6e4 })));
  const changedSet = new Set(files.map((f) => f.replace(/^(\.\/)+/, "")));
  const selected = selectAnalyzers(registry, files);
  const tools = [];
  const findings = [];
  for (const a of selected) {
    const matched = files.filter((f) => a.exts.includes(extname2(f)));
    const bin = exec ? a.bin : resolve(repoDir, a.bin);
    if (!bin) {
      tools.push({ name: a.name, ran: false, fileCount: 0, reason: "not installed" });
      continue;
    }
    const r = await run(bin, a.command(matched));
    tools.push({ name: a.name, ran: true, fileCount: matched.length });
    for (const f of a.parse(r.stdout ?? "", r.stderr ?? "")) {
      let file = isAbsolute(f.file) ? relative(repoDir, f.file) : f.file.replace(/^(\.\/)+/, "");
      file = file.split(sep2).join("/");
      findings.push({ tool: a.name, ...f, file, changed: changedSet.has(file) });
    }
  }
  findings.sort((x, y) => Number(y.changed) - Number(x.changed));
  const truncated = findings.length > MAX_FINDINGS;
  return {
    tools,
    findings: findings.slice(0, MAX_FINDINGS),
    ...truncated ? { truncated: true } : {}
  };
}
async function analyze(repoDir, files) {
  return runAnalyzers(ANALYZERS, { repoDir, files });
}

// lib/rules.mjs
import { readFileSync as readFileSync6, existsSync as existsSync8 } from "node:fs";
import { join as join8 } from "node:path";
function selectRules(rules, changedPaths) {
  return (rules ?? []).filter((r) => matchesScope(r.scope, changedPaths));
}
function loadRulesProse(repoDir) {
  const f = join8(repoDir, ".anchor", "rules.md");
  return existsSync8(f) ? readFileSync6(f, "utf8") : null;
}
function gatherRules({ repoDir, configRules, changedPaths }) {
  return { prose: loadRulesProse(repoDir), rules: selectRules(configRules, changedPaths) };
}

// lib/refs.mjs
var CODE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.py", "*.go", "*.rs", "*.java", "*.rb", "*.c", "*.cpp", "*.h"];
function findRefs(repoDir, symbol, { globs = CODE_GLOBS } = {}) {
  if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) throw new Error("anchor: refs needs a valid identifier");
  const r = runGit(["grep", "-nwE", escapeRe(symbol), "--", ...globs], { cwd: repoDir });
  const references = r.stdout.split("\n").filter(Boolean).map((l) => {
    const m = /^(.+?):(\d+):(.*)$/.exec(l);
    return m ? { file: m[1], line: Number(m[2]), text: m[3].trim() } : null;
  }).filter(Boolean);
  return { symbol, references, count: references.length };
}

// lib/review.mjs
import { readFileSync as readFileSync7, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, existsSync as existsSync9, readdirSync as readdirSync2 } from "node:fs";
import { join as join9, basename as basename2, dirname as dirname3 } from "node:path";
import { createHash } from "node:crypto";

// lib/frontmatter.mjs
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data;
  try {
    data = index_vite_proxy_tmp_default.load(m[1]) ?? {};
  } catch {
    return { data: {}, body: text };
  }
  if (typeof data !== "object" || Array.isArray(data)) return { data: {}, body: text };
  return { data, body: text.slice(m[0].length) };
}
function stringifyFrontmatter(data, body) {
  return `---
${index_vite_proxy_tmp_default.dump(data).trimEnd()}
---

${body}`;
}

// lib/review.mjs
function reviewsDir(repoDir) {
  return join9(repoDir, ".anchor", "reviews");
}
function extractReviewMeta(content) {
  const block = /<!--\s*anchor:meta\s*(\{[\s\S]*?\})\s*-->/.exec(content);
  if (block) {
    try {
      const m = JSON.parse(block[1]);
      if (m && typeof m === "object") {
        return {
          score: typeof m.score === "number" ? m.score : null,
          severities: m.severities && typeof m.severities === "object" ? m.severities : null
        };
      }
    } catch {
    }
  }
  const score = /Confidence:\s*(\d+(?:\.\d+)?)\s*\/\s*5/.exec(content);
  const count = (emoji, word) => {
    const m = new RegExp(`${emoji} ${word}\\s*\\((\\d+)\\)`).exec(content);
    return m ? Number(m[1]) : null;
  };
  const found = {
    critical: count("\u{1F534}", "CRITICAL"),
    high: count("\u{1F7E0}", "HIGH"),
    medium: count("\u{1F7E1}", "MEDIUM"),
    low: count("\u{1F7E2}", "LOW")
  };
  const anyHeader = Object.values(found).some((v) => v !== null);
  return {
    score: score ? Number(score[1]) : null,
    severities: anyHeader ? { critical: found.critical ?? 0, high: found.high ?? 0, medium: found.medium ?? 0, low: found.low ?? 0 } : null
  };
}
function parseFindingBlocks(content) {
  const out = [];
  const re = /<!--\s*anchor:finding\s*(\{[\s\S]*?\})\s*-->/g;
  for (const m of String(content).matchAll(re)) {
    let obj;
    try {
      obj = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.file !== "string" || typeof obj.title !== "string") continue;
    out.push(obj);
  }
  return out;
}
function normalizeTitle(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").replace(/\d+/g, "#").trim();
}
function findingHash(file, title) {
  return createHash("sha1").update(`${file}\0${normalizeTitle(title)}`).digest("hex");
}
function saveReview(repoDir, content, meta = {}) {
  const date = meta.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const sha = meta.sha ?? shortHead(repoDir) ?? "nosha";
  const path2 = meta.path ?? join9(reviewsDir(repoDir), `${date}-${sha}.md`);
  mkdirSync2(dirname3(path2), { recursive: true });
  const extracted = extractReviewMeta(content);
  const findings = parseFindingBlocks(content).map((f) => ({
    file: f.file,
    line: typeof f.line === "number" ? f.line : null,
    title: f.title
  }));
  const fm = {
    date,
    sha,
    target: meta.target ?? "",
    score: meta.score ?? extracted.score,
    severities: meta.severities ?? extracted.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
    findings,
    finding_hashes: findings.map((f) => findingHash(f.file, f.title))
  };
  const prior = listReviews(repoDir).find((r) => r.file !== path2);
  const priorHashes = new Set(prior?.finding_hashes ?? []);
  const repeated = findings.filter((f) => priorHashes.has(findingHash(f.file, f.title)));
  if (repeated.length) fm.repeated_finding_hashes = repeated.map((f) => findingHash(f.file, f.title));
  writeFileSync2(path2, stringifyFrontmatter(fm, content));
  return { path: path2, repeated: repeated.map((f) => ({ file: f.file, title: f.title })) };
}
function listReviews(repoDir) {
  const dir = reviewsDir(repoDir);
  if (!existsSync9(dir)) return [];
  return readdirSync2(dir).filter((f) => f.endsWith(".md")).map((file) => {
    const { data } = parseFrontmatter(readFileSync7(join9(dir, file), "utf8"));
    return {
      file: join9(dir, file),
      date: data.date ?? null,
      sha: data.sha ?? null,
      target: data.target ?? "",
      score: data.score ?? null,
      severities: data.severities ?? null,
      findings: Array.isArray(data.findings) ? data.findings : [],
      finding_hashes: Array.isArray(data.finding_hashes) ? data.finding_hashes : []
    };
  }).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || b.file.localeCompare(a.file));
}
function showReview(repoDir, sha) {
  if (!sha || sha.length < 4) return null;
  const match2 = listReviews(repoDir).find((r) => r.sha === sha || basename2(r.file).includes(sha));
  if (!match2) return null;
  return { content: readFileSync7(match2.file, "utf8") };
}

// lib/init.mjs
import { readFileSync as readFileSync8, existsSync as existsSync10, statSync as statSync2 } from "node:fs";
import { join as join10, extname as extname3, basename as basename3 } from "node:path";
var CONVENTIONAL_RE = /^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\(.+\))?!?:/;
var CONFIG_NAMES = /* @__PURE__ */ new Set(["package.json", "tsconfig.json", "Makefile", "pyproject.toml", "Cargo.toml", "go.mod"]);
function gatherInitData(repoDir, { depth = 100, prLimit = 50, noPrs = false, noGraph = false } = {}) {
  const warnings = [];
  const files = listFiles(repoDir);
  const { history, hotFiles } = buildHistory(repoDir, depth, warnings);
  const structure = buildStructure(repoDir, files, hotFiles);
  const dependencyGraph = noGraph ? null : buildGraph(repoDir, files, hotFiles);
  const pullRequests = noPrs ? null : buildPrs(repoDir, prLimit, warnings);
  return { structure, dependencyGraph, history, pullRequests, warnings };
}
function listFiles(repoDir) {
  const out = runGit(["ls-files"], { cwd: repoDir }).stdout.split("\n").filter(Boolean);
  const anchorignore = join10(repoDir, ".anchorignore");
  const userPatterns = existsSync10(anchorignore) ? readFileSync8(anchorignore, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : [];
  return filterIgnored(out, [...DEFAULT_IGNORE_DIRS, ...userPatterns]);
}
function buildStructure(repoDir, files, hotFiles) {
  const topLevelDirs = [...new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))];
  const languageMix = {};
  for (const f of files) {
    const ext2 = extname3(f);
    if (ext2) languageMix[ext2] = (languageMix[ext2] ?? 0) + 1;
  }
  const notable = /* @__PURE__ */ new Map();
  for (const f of files) {
    const name = basename3(f);
    if (/^(index|main|app)\.(ts|tsx|js|jsx|mjs|py)$/.test(name) || f.startsWith("bin/")) {
      notable.set(f, "entrypoint");
    } else if (CONFIG_NAMES.has(name) || /\.config\.(ts|js|mjs|json)$/.test(name)) {
      if (!notable.has(f)) notable.set(f, "config");
    }
  }
  const bySize = files.map((f) => ({ f, size: safeSize(join10(repoDir, f)) })).sort((a, b) => b.size - a.size).slice(0, 5);
  for (const { f } of bySize) if (!notable.has(f)) notable.set(f, "large");
  for (const { path: path2 } of hotFiles.slice(0, 5)) if (files.includes(path2) && !notable.has(path2)) notable.set(path2, "recently-changed");
  return {
    topLevelDirs,
    fileCount: files.length,
    languageMix,
    notableFiles: [...notable.entries()].slice(0, 15).map(([path2, reason]) => ({ path: path2, reason }))
  };
}
function safeSize(p) {
  try {
    return statSync2(p).size;
  } catch {
    return 0;
  }
}
function normalizeNumstatPath(p) {
  const compact = /^(.*)\{(?:[^{}]*) => ([^{}]*)\}(.*)$/.exec(p);
  if (compact) return (compact[1] + compact[2] + compact[3]).replace(/\/\//g, "/");
  const full = /^.* => (.+)$/.exec(p);
  if (full) return full[1];
  return p;
}
function buildHistory(repoDir, depth, warnings) {
  const log = runGit(["log", "-n", String(depth), "--format=%h|%aI|%an|%s"], { cwd: repoDir });
  if (log.code !== 0 || !log.stdout.trim()) {
    warnings.push("anchor: no commits found. Init will only build the structure and graph.");
    return {
      history: { recentCommits: [], commitMessageStyle: { conventionalCommits: false, avgSubjectLength: 0, commonPrefixes: [] } },
      hotFiles: []
    };
  }
  const recentCommits = log.stdout.trim().split("\n").map((l) => {
    const [sha, date, author, ...rest] = l.split("|");
    return { sha, date, author, subject: rest.join("|"), filesChanged: 0 };
  });
  const numstat = runGit(["log", "-n", String(depth), "--numstat", "--format=@%h"], { cwd: repoDir }).stdout;
  const changeCounts = /* @__PURE__ */ new Map();
  let currentSha = null;
  const perCommit = /* @__PURE__ */ new Map();
  for (const line of numstat.split("\n")) {
    if (line.startsWith("@")) {
      currentSha = line.slice(1);
      continue;
    }
    const m = /^\d+\t\d+\t(.+)$/.exec(line) ?? /^-\t-\t(.+)$/.exec(line);
    if (m && currentSha) {
      const path2 = normalizeNumstatPath(m[1]);
      changeCounts.set(path2, (changeCounts.get(path2) ?? 0) + 1);
      perCommit.set(currentSha, (perCommit.get(currentSha) ?? 0) + 1);
    }
  }
  for (const c of recentCommits) c.filesChanged = perCommit.get(c.sha) ?? 0;
  const hotFiles = [...changeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([path2, changeCount]) => ({ path: path2, changeCount }));
  const subjects = recentCommits.map((c) => c.subject);
  const conventional = subjects.filter((s) => CONVENTIONAL_RE.test(s)).length / subjects.length >= 0.6;
  const avgSubjectLength = Math.round(subjects.reduce((s, x) => s + x.length, 0) / subjects.length);
  const firstWords = /* @__PURE__ */ new Map();
  for (const s of subjects) {
    const w = (s.split(/[\s:]/)[0] ?? "").toLowerCase();
    if (w) firstWords.set(w, (firstWords.get(w) ?? 0) + 1);
  }
  const commonPrefixes = [...firstWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  return {
    history: { recentCommits, commitMessageStyle: { conventionalCommits: conventional, avgSubjectLength, commonPrefixes } },
    hotFiles
  };
}
function buildGraph(repoDir, files, hotFiles) {
  const moduleOf = (f) => f.includes("/") ? f.split("/")[0] : ".";
  const moduleImports = /* @__PURE__ */ new Map();
  const importTargets = /* @__PURE__ */ new Map();
  const fileSet = new Set(files);
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|py)$/.test(f)) continue;
    const abs = join10(repoDir, f);
    if (!existsSync10(abs)) continue;
    for (const spec of parseImports(readFileSync8(abs, "utf8"))) {
      const target = resolveImport(repoDir, f, spec);
      if (!target || !fileSet.has(target)) continue;
      importTargets.set(target, (importTargets.get(target) ?? 0) + 1);
      const from = moduleOf(f);
      const to = moduleOf(target);
      if (from !== to) {
        if (!moduleImports.has(from)) moduleImports.set(from, /* @__PURE__ */ new Set());
        moduleImports.get(from).add(to);
      }
    }
  }
  const allModules = [...new Set(files.map(moduleOf))];
  const modules = allModules.map((path2) => ({
    path: path2,
    imports: [...moduleImports.get(path2) ?? []],
    importedBy: allModules.filter((other) => moduleImports.get(other)?.has(path2))
  }));
  const criticalFiles = [...importTargets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path2, importCount]) => ({ path: path2, importCount }));
  return { modules, hotFiles, criticalFiles };
}
function buildPrs(repoDir, prLimit, warnings) {
  if (!hasCmd("gh")) {
    warnings.push("anchor: gh not available; skipping PR analysis. Use --no-prs to silence this message.");
    return null;
  }
  const r = runCmd("gh", ["pr", "list", "--state", "all", "--limit", String(prLimit), "--json", "number,title,author,state,additions,deletions"], { cwd: repoDir });
  if (r.code !== 0) {
    warnings.push("anchor: gh pr list failed; skipping PR analysis.");
    return null;
  }
  let prs;
  try {
    prs = JSON.parse(r.stdout);
  } catch {
    warnings.push("anchor: could not parse gh pr list output; skipping PR analysis.");
    return null;
  }
  return {
    recent: prs.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author?.login ?? "",
      state: p.state,
      reviewComments: 0,
      additions: p.additions ?? 0,
      deletions: p.deletions ?? 0
    })),
    recurringThemes: []
    // extracted by the LLM in a second pass (spec §9)
  };
}

// lib/status.mjs
import { readFileSync as readFileSync9, existsSync as existsSync11 } from "node:fs";
import { join as join11, basename as basename4 } from "node:path";
function asDateString(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? null : String(v);
}
function artifactInfo(repoDir, name) {
  const p = join11(repoDir, ".anchor", name);
  if (!existsSync11(p)) return null;
  const { data } = parseFrontmatter(readFileSync9(p, "utf8"));
  const built = asDateString(data.built);
  const ageDays = built ? Math.max(0, Math.floor((Date.now() - new Date(built).getTime()) / 864e5)) : null;
  const info = { built, ageDays };
  if (data.fileCount !== void 0) info.fileCount = data.fileCount;
  return info;
}
function getStatus(repoDir) {
  const root = repoDir;
  const reviews = listReviews(root);
  const last = reviews[0] ?? null;
  const lastReview = last ? {
    date: asDateString(last.date),
    sha: last.sha,
    target: last.target,
    score: last.score,
    fileCount: null,
    openFindings: last.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
    archivePath: last.file
  } : null;
  const artifacts = {
    codebaseMap: artifactInfo(root, "codebase-map.md"),
    codebaseGraph: artifactInfo(root, "codebase-graph.md"),
    learnings: { count: listLearnings(root).patterns.length }
  };
  const porcelain = runGit(["status", "--porcelain"], { cwd: root });
  const clean = porcelain.stdout.trim() === "";
  const unpushedR = runGit(["log", "@{u}..", "--oneline"], { cwd: root });
  const hasUpstream = unpushedR.code === 0;
  const unpushedCommits = hasUpstream ? unpushedR.stdout.split("\n").filter(Boolean).length : 0;
  let openPrs = [];
  if (hasCmd("gh")) {
    const r = runCmd("gh", ["pr", "list", "--state", "open", "--json", "number,title,headRefName,baseRefName,updatedAt"], { cwd: root, timeout: 5e3 });
    if (r.code === 0) {
      try {
        openPrs = JSON.parse(r.stdout).map((p) => ({
          number: p.number,
          title: p.title,
          branch: p.headRefName,
          baseBranch: p.baseRefName,
          lastActivity: p.updatedAt,
          reviewCount: 0
        }));
      } catch {
        openPrs = [];
      }
    }
  }
  let nextSuggestion;
  if (openPrs.length > 0) {
    nextSuggestion = `PR #${openPrs[0].number} is awaiting review. Try: /anchor review pr ${openPrs[0].number}`;
  } else if (!clean) {
    nextSuggestion = "You have uncommitted changes. Try: /anchor review";
  } else if (unpushedCommits > 0) {
    nextSuggestion = `You have ${unpushedCommits} unpushed commit(s). Try: /anchor review @{u}..HEAD`;
  } else {
    nextSuggestion = "All clean \u2014 run /anchor review when you have new changes";
  }
  return {
    repo: { path: root, name: basename4(root) },
    lastReview,
    artifacts,
    git: { clean, hasUpstream, unpushedCommits, openPrs },
    nextSuggestion
  };
}
function renderStatusText(s) {
  const lines = [];
  lines.push("Anchor Status");
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push(`Repo:           ${s.repo.path}`);
  lines.push("");
  if (s.lastReview) {
    lines.push(`Last review:    ${s.lastReview.date} (${s.lastReview.target || "unknown target"})`);
    lines.push(`                score: ${s.lastReview.score ?? "?"}/5`);
    lines.push(`                archive: ${s.lastReview.archivePath}`);
    const f = s.lastReview.openFindings;
    lines.push(`Open findings:  ${f.critical} critical, ${f.high} high, ${f.medium} medium, ${f.low} low (from last review)`);
  } else {
    lines.push("Last review:    never");
  }
  lines.push("");
  const map = s.artifacts.codebaseMap;
  const graph = s.artifacts.codebaseGraph;
  lines.push(`Codebase map:   ${map ? `built ${map.built} (${map.ageDays} days ago)${map.fileCount ? ` \u2014 ${map.fileCount} files` : ""}` : "not built \u2014 run /anchor init"}`);
  lines.push(`Graph:          ${graph ? `built ${graph.built} (${graph.ageDays} days ago)` : "not built"}`);
  lines.push(`Learnings:      ${s.artifacts.learnings.count} patterns`);
  lines.push("");
  lines.push(`Git status:     ${s.git.clean ? "\u2713 working tree clean" : "\u26A0 uncommitted changes"}`);
  lines.push(`                ${!s.git.hasUpstream ? "\u2014 no upstream configured" : s.git.unpushedCommits === 0 ? "\u2713 0 unpushed commits" : `\u26A0 ${s.git.unpushedCommits} unpushed commits`}`);
  if (s.git.openPrs.length > 0) {
    for (const pr of s.git.openPrs) {
      lines.push(`                \u26A0 PR #${pr.number} open (${pr.branch} \u2192 ${pr.baseBranch})`);
    }
  } else {
    lines.push("                \u2713 no open PRs");
  }
  lines.push("");
  lines.push(`Next:           ${s.nextSuggestion}`);
  return lines.join("\n");
}

// lib/hook.mjs
import { existsSync as existsSync12, mkdirSync as mkdirSync3, readFileSync as readFileSync10, writeFileSync as writeFileSync3, rmSync, statSync as statSync3, chmodSync } from "node:fs";
import { join as join12 } from "node:path";

// lib/hook-script.mjs
var MARKER = "# Anchor pre-push reminder";
var PRE_PUSH_SCRIPT = `#!/usr/bin/env bash
# Anchor pre-push reminder. Git invokes this when \`git push\` runs.
# It only prints a reminder \u2014 it always exits 0 and never blocks the push.
# Opt out with ANCHOR_NO_REMIND=1, or remove via \`anchor hook uninstall\`.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

remote="\${1:-origin}"
branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo '?')"

echo ""
echo "[anchor] Pushing to \${remote}/\${branch}."
echo "  To review these commits after the push:  /anchor review @{u}..HEAD"
echo "  To review the PR (if any):               /anchor review pr <number>"
echo "  Or run /anchor status for a repo summary."
echo ""
exit 0
`;

// lib/hook.mjs
function gitDirOf(repoDir) {
  const gitDir = join12(repoDir, ".git");
  try {
    if (statSync3(gitDir).isDirectory()) return gitDir;
  } catch {
  }
  return null;
}
function installHook(repoDir, { force = false } = {}) {
  const gitDir = gitDirOf(repoDir);
  if (!gitDir) {
    throw new Error("anchor: hook install must be run from inside a git repo (worktrees/submodules not supported).");
  }
  const hookPath = join12(gitDir, "hooks", "pre-push");
  if (existsSync12(hookPath) && !force) {
    throw new Error("anchor: .git/hooks/pre-push already exists. Re-run with --force to overwrite.");
  }
  mkdirSync3(join12(gitDir, "hooks"), { recursive: true });
  writeFileSync3(hookPath, PRE_PUSH_SCRIPT, { mode: 493 });
  chmodSync(hookPath, 493);
  return { installed: true, path: hookPath };
}
function hookStatus(repoDir) {
  const hookPath = join12(repoDir, ".git", "hooks", "pre-push");
  if (!existsSync12(hookPath)) return { installed: false, path: hookPath };
  const isAnchor = readFileSync10(hookPath, "utf8").includes(MARKER);
  return isAnchor ? { installed: true, path: hookPath } : { installed: false, path: hookPath, foreign: true };
}
function uninstallHook(repoDir) {
  const hookPath = join12(repoDir, ".git", "hooks", "pre-push");
  if (!existsSync12(hookPath)) {
    return { removed: false, message: "no pre-push hook installed" };
  }
  if (!readFileSync10(hookPath, "utf8").includes(MARKER)) {
    throw new Error("anchor: existing .git/hooks/pre-push is not Anchor's \u2014 leaving it alone");
  }
  rmSync(hookPath);
  return { removed: true, path: hookPath };
}

// lib/cli.mjs
var USAGE = `usage: anchor <init|diff|context|analyze|rules|refs|review|learn|status|config|doctor|hook> [args] [--format json|text]`;
var VALUED = /* @__PURE__ */ new Set(["format", "reason", "max-files", "from-diff", "depth", "target", "max-diff-lines", "scope", "category", "action"]);
function parseArgs(argv) {
  const positional = [];
  const flags = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      if (VALUED.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags.set(key, argv[++i]);
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}
function emit(obj, flags, renderText) {
  if (flags.get("format") === "text" && renderText) {
    process.stdout.write(renderText(obj) + "\n");
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  }
}
function renderDoctorText({ checks }) {
  return checks.map((c) => {
    const icon = c.ok ? "\u2713" : c.level === "warn" ? "\u26A0" : "\u2717";
    const fix = c.ok ? "" : ` \u2192 ${c.fix}`;
    return `${icon} ${c.name} \u2014 ${c.message}${fix}`;
  }).join("\n");
}
function requireRepo() {
  if (!isGitRepo(process.cwd())) {
    throw new Error("anchor: not a git repository. Run from inside a repo.");
  }
}
function loadCfg() {
  const { config, warnings } = loadConfig(process.cwd());
  for (const w of warnings) process.stderr.write(w + "\n");
  return config;
}
function diffTargetTokens(positional, flags) {
  if (flags.has("from-diff")) {
    const fd = flags.get("from-diff");
    return typeof fd === "string" ? [fd, ...positional] : positional;
  }
  if (flags.has("staged")) return ["--staged", ...positional];
  return positional;
}
var HANDLERS = {
  doctor(positional, flags) {
    const result = runDoctor({ cwd: process.cwd() });
    emit(result, flags, renderDoctorText);
    process.exitCode = result.ok ? 0 : 1;
  },
  config(positional, flags) {
    const { config, warnings } = loadConfig(process.cwd());
    for (const w of warnings) process.stderr.write(w + "\n");
    if (positional[0] === "validate") {
      emit({ valid: warnings.length === 0, warnings }, flags);
      process.exitCode = warnings.length === 0 ? 0 : 1;
      return;
    }
    emit(config, flags);
  },
  diff(positional, flags) {
    requireRepo();
    const config = loadCfg();
    let tokens = flags.has("staged") ? ["--staged", ...positional] : positional;
    let sinceLast;
    if (flags.has("since-last")) {
      const lastSha = listReviews(process.cwd())[0]?.sha;
      const r = sinceLastRange(process.cwd(), lastSha);
      if (r.mode === "range") {
        tokens = [r.range];
        sinceLast = { applied: true, range: r.range };
      } else {
        tokens = [];
        sinceLast = { applied: false, fallback: r.reason };
        process.stderr.write(`anchor: --since-last fell back to the full diff \u2014 ${r.reason}.
`);
      }
    }
    const d = getDiff(tokens, { cwd: process.cwd() });
    const filtered = d.files.filter((f) => !isIgnored(f.path, config.ignore));
    const result = applyBudget(withStats({ ...d, files: filtered }), {
      maxLines: Number(flags.get("max-diff-lines") ?? config.max_diff_lines),
      maxFiles: Number(flags.get("max-files") ?? config.max_files),
      force: flags.has("force"),
      fallbackLines: config.max_diff_lines,
      fallbackFiles: config.max_files
    });
    if (sinceLast) result.sinceLast = sinceLast;
    if (result.budgetWarning) process.stderr.write(result.budgetWarning + "\n");
    emit(result, flags);
  },
  context(positional, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const maxFiles = Number(flags.get("max-files") ?? 50);
    const files = flags.has("from-diff") || flags.has("staged") ? getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() }).files.map((f) => f.path) : positional;
    emit(getContext({ files, repoDir: process.cwd(), maxFiles, ignore: config.ignore }), flags);
  },
  async analyze(positional, flags) {
    requireRepo();
    const config = loadCfg();
    const files = getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() }).files.map((f) => f.path).filter((p) => !isIgnored(p, config.ignore));
    emit(await analyze(process.cwd(), files), flags);
  },
  rules(positional, flags) {
    requireRepo();
    const config = loadCfg();
    const changedPaths = getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() }).files.map((f) => f.path);
    emit(gatherRules({ repoDir: process.cwd(), configRules: config.rules, changedPaths }), flags);
  },
  refs(positional, flags) {
    requireRepo();
    if (!positional[0]) throw new Error("anchor: refs needs a symbol, e.g. `anchor refs myFunction`");
    emit(findRefs(process.cwd(), positional[0]), flags);
  },
  learn(positional, flags) {
    requireRepo();
    const [action, ...args] = positional;
    if (action === void 0 || action === "list") {
      const all = listLearnings(process.cwd());
      if (flags.has("from-diff") || flags.has("staged")) {
        const changedPaths = getDiff(diffTargetTokens(args, flags), { cwd: process.cwd() }).files.map((f) => f.path);
        return emit({ patterns: selectLearnings(all.patterns, changedPaths) }, flags);
      }
      return emit(all, flags);
    }
    if (action === "add") {
      ensureGitignore(process.cwd());
      const meta = {
        scope: (
          /** @type {string|undefined} */
          flags.get("scope")
        ),
        category: (
          /** @type {string|undefined} */
          flags.get("category")
        ),
        action: (
          /** @type {string|undefined} */
          flags.get("action")
        )
      };
      const r = addLearning(
        process.cwd(),
        args.join(" "),
        /** @type {string|undefined} */
        flags.get("reason"),
        meta
      );
      if (r.deduped) process.stderr.write("\u21AA already in learnings, skipped\n");
      return emit(r, flags);
    }
    if (action === "remove") return emit(removeLearning(process.cwd(), args.join(" ")), flags);
    throw new Error("anchor: learn needs add|list|remove");
  },
  review(positional, flags) {
    requireRepo();
    const [action, ...args] = positional;
    if (action === "save") {
      ensureGitignore(process.cwd());
      const content = readFileSync11(0, "utf8");
      return emit(saveReview(process.cwd(), content, { path: args[0], target: (
        /** @type {string|undefined} */
        flags.get("target")
      ) }), flags);
    }
    if (action === "list") return emit(listReviews(process.cwd()), flags);
    if (action === "show") {
      const r = showReview(process.cwd(), args[0] ?? "");
      if (!r) throw new Error(`anchor: no archived review matching "${args[0]}"`);
      return process.stdout.write(r.content);
    }
    throw new Error("anchor: review needs save|list|show");
  },
  status(positional, flags) {
    requireRepo();
    emit(getStatus(process.cwd()), flags, renderStatusText);
  },
  init(positional, flags) {
    requireRepo();
    const data = gatherInitData(process.cwd(), {
      depth: Number(flags.get("depth") ?? 100),
      noPrs: flags.has("no-prs"),
      noGraph: flags.has("no-graph")
    });
    for (const w of data.warnings) process.stderr.write(w + "\n");
    emit(data, flags);
  },
  hook(positional, flags) {
    const [action] = positional;
    if (action === void 0) return emit(hookStatus(process.cwd()), flags);
    if (action === "install") return emit(installHook(process.cwd(), { force: flags.has("force") }), flags);
    if (action === "uninstall") return emit(uninstallHook(process.cwd()), flags);
    throw new Error("anchor: hook needs install|uninstall");
  }
};
async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const handler = HANDLERS[sub];
  if (!handler) {
    process.stderr.write(USAGE + "\n");
    process.exitCode = 1;
    return;
  }
  try {
    await handler(positional, flags, rest);
  } catch (e) {
    process.stderr.write((e?.message ?? String(e)) + "\n");
    process.exitCode = 1;
  }
}
var isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath2(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) main();
export {
  main,
  parseArgs
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
