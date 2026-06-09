namespace CopaDraft.Engine.Tests;

// Sanity check confirming the test project + Engine reference are wired up.
// Real engine-parity tests arrive in later steps (RNG, derive, simulateMatch).
public class ScaffoldSanityTests
{
    [Fact]
    public void TestInfrastructureIsWiredUp()
    {
        Assert.True(true);
    }
}
