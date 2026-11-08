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
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("codexpp-\(UUID().uuidString).asar")
        defer { try? FileManager.default.removeItem(at: output) }
        let header = try archive.replacing(result.renderers, output: output)
        let patched = try AsarArchive(output)
        XCTAssertNotEqual(archive.headerHash, header)
        XCTAssertEqual(patched.headerHash, header)
        for (path, bytes) in result.renderers {
            XCTAssertEqual(try patched.data(at: path), bytes)
        }
        XCTAssertEqual(try patched.data(at: "package.json"), try archive.data(at: "package.json"))
        let browser = String(decoding: try patched.data(at: XCTUnwrap(result.browserPath)), as: UTF8.self)
        XCTAssertTrue(browser.contains("__codexPPNativeBrowser?.frameForContextMenu("))
        XCTAssertTrue(browser.contains("__codexPPWrapAppToolsConfig("))
    }
}
