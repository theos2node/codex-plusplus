import XCTest
@testable import CodexPPCore

final class RspackAdapterTests: XCTestCase {
    func testReviewedBuildWritesValidArchive() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_RSPACK_APP"] else {
            throw XCTSkip("Set CODEXPP_RSPACK_APP to the original ChatGPT build 25679.")
        }
        let app = URL(fileURLWithPath: path)
        let archive = try AsarArchive(app.appendingPathComponent("Contents/Resources/app.asar"))
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let settings = root.appendingPathComponent("Sources/CodexPP/Resources/native-settings.js")
        let result = try RendererPipeline().run(archive: archive, settingsRuntime: String(contentsOf: settings, encoding: .utf8))
        XCTAssertTrue(result.steps.filter(\.required).allSatisfy { $0.error == nil })
        XCTAssertEqual(result.shellPaths.count, 2)
        XCTAssertEqual(result.bookmarkPaths.count, 5)
        XCTAssertNotNil(result.settings)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("codexpp-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        let adapter = try PatchAdapter.forBundle(app)
        let originalBootstrap = try adapter.validate(version: adapter.version, build: adapter.build, archive: archive)
        let bootstrap = try adapter.bootstrap(original: originalBootstrap, port: 9222,
            helper: directory.appendingPathComponent("Codex++.app"), support: directory)
        let replacements = [(adapter.main, bootstrap)] + result.renderers
        let output = directory.appendingPathComponent("app.asar")
        let header = try archive.replacing(replacements, output: output)
        let patched = try AsarArchive(output)
        XCTAssertNotEqual(archive.headerHash, header)
        XCTAssertEqual(patched.headerHash, header)
        for (path, bytes) in replacements {
            XCTAssertEqual(try patched.data(at: path), bytes)
        }
        XCTAssertEqual(try patched.data(at: "package.json"), try archive.data(at: "package.json"))
        let browser = String(decoding: try patched.data(at: XCTUnwrap(result.browserPath)), as: UTF8.self)
        XCTAssertTrue(browser.contains("__codexPPNativeBrowser?.frameForContextMenu("))
        XCTAssertTrue(browser.contains("__codexPPWrapAppToolsConfig("))
        try checkBootstrap(try patched.data(at: adapter.main), app: app, directory: directory)
        let settingsReport = try XCTUnwrap(result.settings)
        let settingsPaths = [
            try XCTUnwrap(settingsReport.hooks["route"]),
            settingsReport.page.path,
            try XCTUnwrap(settingsReport.hooks["search"]),
        ]
        let settingsSources = try settingsPaths.map { path in
            let source = directory.appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent)
            try patched.data(at: path).write(to: source)
            return source.path
        }
        let harness = root.appendingPathComponent("Tests/fixtures/rspack/settings-runtime.cjs")
        try runNode([harness.path] + settingsSources, app: app)
        try checkNativeIntegrity(app: app, adapter: adapter, patchedHeader: header)
    }

    private func checkBootstrap(_ bytes: Data, app: URL, directory: URL) throws {
        let source = directory.appendingPathComponent("bootstrap.cjs")
        try bytes.write(to: source)
        try runNode(["--check", source.path], app: app)
    }

    private func runNode(_ arguments: [String], app: URL) throws {
        let node = Process()
        node.executableURL = app.appendingPathComponent("Contents/Resources/cua_node/bin/node")
        node.arguments = arguments
        let diagnostics = Pipe()
        node.standardError = diagnostics
        try node.run()
        let errors = diagnostics.fileHandleForReading.readDataToEndOfFile()
        node.waitUntilExit()
        XCTAssertEqual(node.terminationStatus, 0, String(decoding: errors, as: UTF8.self))
    }

    private func checkNativeIntegrity(app: URL, adapter: PatchAdapter, patchedHeader: String) throws {
        let plist = try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist"))
        let metadata = try XCTUnwrap(PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any])
        var integrity = try XCTUnwrap(metadata["ElectronAsarIntegrity"] as? [String: Any])
        let originalDigest = try NativeIntegrityDigest.dictionaryHash(integrity)
        integrity["Resources/app.asar"] = ["algorithm": "SHA256", "hash": patchedHeader]
        let updatedDigest = try NativeIntegrityDigest.dictionaryHash(integrity)
        let frameworkPath = try XCTUnwrap(adapter.frameworkPath)
        let framework = try Data(contentsOf: app.appendingPathComponent(frameworkPath), options: .mappedIfSafe)
        let offset = try XCTUnwrap(adapter.integrityOffset)
        let patchedFramework = try NativeIntegrityDigest.replacing(framework, offset: offset,
            expected: originalDigest, replacement: updatedDigest)
        XCTAssertEqual(patchedFramework.count, framework.count)
        XCTAssertEqual(patchedFramework.subdata(in: offset + 34..<offset + 66), updatedDigest)
        XCTAssertNotEqual(originalDigest, updatedDigest)
    }
}
