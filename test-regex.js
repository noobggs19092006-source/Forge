const str = '    return () => {\n      tl.kill();\n    },\n  }, [prefersReducedMotion, lenis]);'; console.log(str.replace(/\\},\\s*\\n\\s*\\},(\\s*\\[)/g, '};\\n  },\'));
