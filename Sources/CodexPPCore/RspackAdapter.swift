import Foundation

/// Build 25679 moved the renderer to numbered Rspack chunks and the main
/// process to CommonJS chunk factories. Match only the reviewed archive.
enum RspackAdapter {
    static let headerHash = "70b5309710326ef8ab88e2534454cc2a8c9ba0938715d527eb09aa14a837fe02"
    private static let archiveHash = "766faa8a3da8f6d6902c751d5b6b29395a6c5bf3c966ef7f8ca3f629d931df85"
    static let browserPath = ".vite/build/early-bootstrap-854-5239e17d5abd99b3.js"
    private static let files = [
        "visibility": "webview/assets/async/324957.776af63e2a.js",
        "settingsLayout": "webview/assets/async/405910.89912dbb76.js",
        "app": "webview/assets/async/366057.8dff3ed0b6.js",
        "general": "webview/assets/async/553834.8bcca01908.js",
        "frame": "webview/assets/async/499225.6d2e47bea2.js",
        "surface": "webview/assets/async/961657.97fdcc5e7d.js",
        "menu": "webview/assets/async/959752.54e55a5550.js",
        "tab": "webview/assets/async/620182.5dff767066.js",
        "detached": "webview/assets/async/622516.efff4a217e.js",
        "suggested": "webview/assets/async/602117.ae4416017a.js",
        "entry": "webview/assets/348410.46c6a64506.js",
    ]

    static func authenticate(_ archive: AsarArchive) throws {
        try PatchAdapter.approveArchive(archive)
        guard try fileSHA256(archive.url) == archiveHash else {
            throw PatchError.invalid("ChatGPT 25679 does not match the reviewed Rspack archive.")
        }
    }

    static func settings(archive: AsarArchive, runtime: String) throws
        -> (patches: [(String, Data)], report: NativeSettingsAdapter.Discovery)
    {
        let patches = try patch("settings", archive: archive, keys: ["visibility", "settingsLayout", "app", "general"], runtime: runtime)
        let general = files["general"]!
        let components = ["Page": "eB.P", "Section": "P.X", "Card": "B.t", "Row": "D.ic", "Toggle": "L.l", "Button": "ygO2.$"]
            .mapValues { NativeSettingsAdapter.Binding(path: general, binding: $0) }
        return (patches, NativeSettingsAdapter.Discovery(schema: 1,
            page: .init(path: general, binding: "ppExtensionsPage"), components: components,
            hooks: ["visibility": files["visibility"]!, "route": files["app"]!, "search": files["settingsLayout"]!]))
    }

    static func shell(archive: AsarArchive) throws -> [(String, Data)] {
        try patch("shell", archive: archive, keys: ["frame", "surface"], runtime: runtime("shell-runtime"))
    }

    static func bookmarks(archive: AsarArchive) throws -> [(String, Data)] {
        try patch("bookmarks", archive: archive, keys: ["menu", "tab", "detached", "suggested", "entry"], runtime: runtime("bookmarks-runtime"))
    }

    private static func runtime(_ name: String) throws -> String {
        guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
            throw PatchError.invalid("Missing Rspack adapter runtime: \(name).")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static func patch(_ kind: String, archive: AsarArchive, keys: [String], runtime: String) throws -> [(String, Data)] {
        var sources: [String: String] = [:]
        for key in keys {
            guard let path = files[key], let source = String(data: try archive.data(at: path), encoding: .utf8) else {
                throw PatchError.invalid("Missing Rspack source: \(key).")
            }
            sources[key] = source
        }
        guard let result = try JavaScriptDiscovery.run(archive: archive, adapter: "rspack",
            input: ["kind": kind, "sources": sources, "runtime": runtime]) else {
            throw PatchError.invalid("The signed parser runtime is required for the Rspack build.")
        }
        let patched = try JSONDecoder().decode([String: String].self, from: result)
        guard Set(patched.keys) == Set(keys) else {
            throw PatchError.invalid("Unexpected Rspack patch output.")
        }
        return keys.map { (files[$0]!, Data(patched[$0]!.utf8)) }
    }
}
